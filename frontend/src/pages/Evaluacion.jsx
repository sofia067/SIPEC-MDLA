import React, { useEffect, useState } from 'react';
import Sidebar from '../components/sidebar';
import UserDropdown from '../components/UserDropdown';
import { apiRequest } from '../services/api';
import ModalNotificacionWhatsApp from '../components/ModalNotificacionWhatsApp';
import { useAuth } from '../auth/AuthContext';

const etapasProceso = [
  { value: 'application_received', label: 'Postulación recibida' },
  { value: 'document_review', label: 'Revisión de documentos' },
  { value: 'exam', label: 'Examen' },
  { value: 'interview', label: 'Entrevista personal' },
  { value: 'practical', label: 'Práctica básica' },
  { value: 'final_result', label: 'Resultado final' },
];

const fechaActualLima = () => {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};

export default function Evaluaciones() {
  const { user } = useAuth();
  const [modo, setModo] = useState('historial');
  const [candidatos, setCandidatos] = useState([]);
  const [avisosSimulados, setAvisosSimulados] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [candidato, setCandidato] = useState('');
  const [indicePregunta, setIndicePregunta] = useState(0);
  const [respuestas, setRespuestas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [etapasPendientes, setEtapasPendientes] = useState({});
  const [mensajesPendientes, setMensajesPendientes] = useState({});
  const [citasPendientes, setCitasPendientes] = useState({});
  const [guardandoEtapa, setGuardandoEtapa] = useState('');
  const [candidatoWhatsApp, setCandidatoWhatsApp] = useState(null);
  const [etapaWhatsApp, setEtapaWhatsApp] = useState('');
  const [mensajeAvance, setMensajeAvance] = useState('');
  const [candidatoAviso, setCandidatoAviso] = useState('');
  const [mensajeAviso, setMensajeAviso] = useState('');
  const [confirmarAviso, setConfirmarAviso] = useState(false);
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [estadoAviso, setEstadoAviso] = useState('');
  const puedeActualizarAvance = ['admin', 'hr_specialist'].includes(user?.role);
  const candidatoSeleccionado = candidatos.find((item) => item.id === candidato);
  const puesto = candidatoSeleccionado?.position_title ?? '';
  const bancoSeleccionado = bancos.find((banco) => banco.puesto === puesto);
  const preguntas = bancoSeleccionado?.preguntas ?? [];
  const cargarDatos = async () => {
    const [candidateResult, bankResult, noticeResult] = await Promise.all([
      apiRequest('/blind-selection/candidates'),
      apiRequest('/blind-selection/banks'),
      apiRequest('/blind-selection/simulated-notifications'),
    ]);
    setCandidatos(candidateResult.candidates);
    setBancos(bankResult.banks);
    setAvisosSimulados(noticeResult.notifications);
  };

  useEffect(() => {
    cargarDatos()
      .catch((requestError) => setError(requestError.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        cargarDatos().catch((requestError) => setError(requestError.message));
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const iniciarEvaluacion = (event) => {
    event.preventDefault();
    if (!candidatoSeleccionado || !bancoSeleccionado) return;
    setIndicePregunta(0);
    setRespuestas({});
    setError('');
    setModo('prueba');
  };

  const finalizarEvaluacion = async () => {
    setEnviando(true);
    setError('');
    try {
      const respuestasFormateadas = preguntas.map((pregunta, index) => {
        if (pregunta.tipo === 'escrita') {
          return respuestas[index] || '';
        }
        return respuestas[index] ?? '';
      });
      const { exam } = await apiRequest(`/blind-selection/candidates/${candidato}/exam`, {
        method: 'POST',
        body: JSON.stringify({ answers: respuestasFormateadas }),
      });
      const puntajeObtenido = Number(exam.objective_score);
      const estadoFinal = puntajeObtenido === 100 ? 'Pendiente de revisión' : 'Desaprobado';
      setResultado({
        correctas: exam.correct_answers,
        totalObjetivas: exam.total_objective_questions,
        puntaje: puntajeObtenido,
        estado: estadoFinal,
      });
      setModo('resultado');
      try {
        await cargarDatos();
      } catch (refreshError) {
        setError(`El examen se guardó, pero no se pudo actualizar el ranking: ${refreshError.message}`);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setEnviando(false);
    }
  };

  const volverAlHistorial = () => {
    setModo('historial');
    setCandidato('');
    setResultado(null);
  };

  const guardarAvance = async (event, item) => {
    event.preventDefault();
    setGuardandoEtapa(item.id);
    setError('');
    setMensajeAvance('');
    const appointment = citasPendientes[item.id] ?? {};
    const processStage = etapasPendientes[item.id] ?? item.process_stage;
    const hasAppointmentDetails = Object.values(appointment).some(Boolean);
    
    if (hasAppointmentDetails && (
      processStage !== 'interview'
      || !appointment.date
      || !appointment.time
      || !appointment.modality
      || !appointment.location?.trim()
    )) {
      setError('Completa fecha, hora, modalidad y lugar o enlace para publicar la citación.');
      setGuardandoEtapa('');
      return;
    }

    try {
      await apiRequest(`/blind-selection/candidates/${item.id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({
          processStage,
          publicMessage: mensajesPendientes[item.id] ?? '',
          ...(hasAppointmentDetails ? {
            interviewDate: appointment.date ?? '',
            interviewTime: appointment.time ?? '',
            interviewModality: appointment.modality ?? '',
            interviewLocation: appointment.location ?? '',
          } : {}),
        }),
      });
      
      setEtapasPendientes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMensajesPendientes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setCitasPendientes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMensajeAvance(hasAppointmentDetails
        ? `Cita de entrevista publicada para ${item.application_code}.`
        : `Avance actualizado para ${item.application_code}.`);
      if (processStage === 'exam' || processStage === 'interview') {
        setCandidatoWhatsApp(item);
        setEtapaWhatsApp(processStage);
      }
      try {
        await cargarDatos();
      } catch (refreshError) {
        setError(`El avance se guardó, pero no se pudo actualizar la lista: ${refreshError.message}`);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGuardandoEtapa('');
    }
  };

  const evaluacionesConExamen = candidatos.filter((item) => item.exam_id);
  const puestosUnicos = [...new Set(evaluacionesConExamen.map((item) => item.position_title))];

  return (
    <div className="app-shell flex h-dvh flex-col bg-gray-100 font-sans text-gray-800 md:flex-row">
      <Sidebar />

      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-y-auto">
        <header className="bg-white border-b px-4 sm:px-8 py-3 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-blue-950">SIPEC-MLA</h1>
            <span className="hidden sm:inline text-xs bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded-full">
              Evaluaciones Técnicas
            </span>
          </div>
          <UserDropdown />
        </header>

        <main className="p-4 sm:p-8 space-y-6">
          {error && (
            <div role="alert" className="rounded border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {modo === 'historial' && (
            <>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Evaluaciones de Competencias</h2>
                  <p className="text-xs text-gray-500">Pruebas técnicas y resultados por puesto solicitado</p>
                </div>
                <button
                  onClick={() => setModo('preparacion')}
                  className="bg-blue-950 hover:bg-blue-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm" >
                  Iniciar evaluación técnica
                </button>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-relaxed text-blue-950">
                Las preguntas y sus claves deben verificarse con fuentes oficiales antes de usarse en evaluaciones reales.
              </div>

              {/* seccion del avance del proceso de  seleccion */}
              <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="mb-1 font-bold text-sm text-gray-900">Avance del proceso de selección</h3>
                <p className="mb-4 text-xs text-gray-500">Las etapas y mensajes publicados aquí también estarán disponibles en el seguimiento del postulante.</p>
                {mensajeAvance && <p role="status" className="mb-3 rounded bg-green-50 p-3 text-xs text-green-800">{mensajeAvance}</p>}
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="pb-3 font-medium">Código</th>
                      <th className="pb-3 font-medium">Puesto</th>
                      <th className="pb-3 font-medium">Etapa actual</th>
                      {puedeActualizarAvance && <th className="pb-3 font-medium">Mensaje al postulante</th>}
                      {puedeActualizarAvance && <th className="pb-3 font-medium">Acción</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {candidatos.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 font-bold text-blue-950">{item.application_code}</td>
                        <td className="py-3 text-gray-700">{item.position_title}</td>
                        <td className="py-3">
                          {puedeActualizarAvance ? (
                            <select
                              aria-label={`Etapa de ${item.application_code}`}
                              value={etapasPendientes[item.id] ?? item.process_stage}
                              onChange={(event) => {
                                setEtapasPendientes((current) => ({ ...current, [item.id]: event.target.value }));
                                if (event.target.value !== 'interview') {
                                  setCitasPendientes((current) => {
                                    const next = { ...current };
                                    delete next[item.id];
                                    return next;
                                  });
                                }
                                setMensajeAvance('');
                              }}
                              className="w-full rounded-lg border border-gray-300 bg-white p-2" >
                              {etapasProceso.map((etapa) => <option key={etapa.value} value={etapa.value}>{etapa.label}</option>)}
                            </select>
                          ) : (
                            etapasProceso.find((etapa) => etapa.value === item.process_stage)?.label ?? item.process_stage
                          )}
                        </td>
                        {puedeActualizarAvance && (
                          <>
                            <td className="py-3">
                              <input
                                type="text"
                                maxLength={500}
                                aria-label={`Mensaje público para ${item.application_code}`}
                                placeholder="Opcional"
                                value={mensajesPendientes[item.id] ?? ''}
                                onChange={(event) => {
                                  setMensajesPendientes((current) => ({ ...current, [item.id]: event.target.value }));
                                  setMensajeAvance('');
                                }}
                                className="w-full rounded-lg border border-gray-300 p-2" />
                              {(etapasPendientes[item.id] ?? item.process_stage) === 'interview' && (
                                <div className="mt-2 space-y-2 rounded-lg bg-blue-50 p-2">
                                  <p className="font-semibold text-blue-950">Citación de entrevista (opcional)</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="date"
                                      aria-label={`Fecha de entrevista para ${item.application_code}`}
                                      min={fechaActualLima()}
                                      value={citasPendientes[item.id]?.date ?? ''}
                                      onChange={(event) => {
                                        setCitasPendientes((current) => ({
                                          ...current,
                                          [item.id]: { ...current[item.id], date: event.target.value },
                                        }));
                                        setMensajeAvance('');
                                      }}
                                      className="min-w-0 w-full rounded-lg border border-gray-300 p-2" />
                                    <input
                                      type="time"
                                      aria-label={`Hora de entrevista para ${item.application_code}`}
                                      value={citasPendientes[item.id]?.time ?? ''}
                                      onChange={(event) => {
                                        setCitasPendientes((current) => ({
                                          ...current,
                                          [item.id]: { ...current[item.id], time: event.target.value },
                                        }));
                                        setMensajeAvance('');
                                      }}
                                      className="min-w-0 w-full rounded-lg border border-gray-300 p-2" />
                                  </div>
                                  <select
                                    aria-label={`Modalidad de entrevista para ${item.application_code}`}
                                    value={citasPendientes[item.id]?.modality ?? ''}
                                    onChange={(event) => {
                                      setCitasPendientes((current) => ({
                                        ...current,
                                        [item.id]: { ...current[item.id], modality: event.target.value },
                                      }));
                                      setMensajeAvance('');
                                    }}
                                    className="w-full rounded-lg border border-gray-300 bg-white p-2">
                                    <option value="">Modalidad</option>
                                    <option value="in_person">Presencial</option>
                                    <option value="virtual">Virtual</option>
                                  </select>
                                  <input
                                    type="text"
                                    maxLength={500}
                                    aria-label={`Lugar o enlace de entrevista para ${item.application_code}`}
                                    placeholder={citasPendientes[item.id]?.modality === 'virtual' ? 'Enlace o instrucciones' : 'Lugar de la entrevista'}
                                    value={citasPendientes[item.id]?.location ?? ''}
                                    onChange={(event) => {
                                      setCitasPendientes((current) => ({
                                        ...current,
                                        [item.id]: { ...current[item.id], location: event.target.value },
                                      }));
                                      setMensajeAvance('');
                                    }}
                                    className="w-full rounded-lg border border-gray-300 p-2"/>
                                </div>
                              )}
                            </td>
                            <td className="py-3">
                              <form onSubmit={(event) => guardarAvance(event, item)}>
                                <button
                                  type="submit"
                                  disabled={guardandoEtapa === item.id}
                                  className="rounded-lg bg-blue-950 px-3 py-2 font-semibold text-white hover:bg-blue-900 disabled:bg-gray-400" >
                                  {guardandoEtapa === item.id ? 'Guardando…' : 'Guardar'}
                                </button>
                              </form>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {!cargando && candidatos.length === 0 && (
                      <tr><td colSpan={puedeActualizarAvance ? '5' : '3'} className="py-6 text-center text-gray-500">Aún no hay postulantes registrados.</td></tr>
                    )}
                    {cargando && (
                      <tr><td colSpan={puedeActualizarAvance ? '5' : '3'} className="py-6 text-center text-gray-500">Cargando postulantes…</td></tr>
                    )}
                  </tbody>
                </table>
              </section>

              {/* vista del podio de los top 3*/}
              {puestosUnicos.length > 0 && (
                <div className="space-y-4 mt-6">
                  <h3 className="font-bold text-sm text-gray-900">Podio de Mejores Puntajes (Top 3 por Puesto)</h3>
                  {puestosUnicos.map((puestoItem) => {
                    const top3Puesto = evaluacionesConExamen
                      .filter((item) => item.position_title === puestoItem)
                      .sort((a, b) => (
                        Number(b.objective_score || 0) - Number(a.objective_score || 0)
                        || new Date(a.submitted_at) - new Date(b.submitted_at)
                        || a.application_code.localeCompare(b.application_code)
                      ))
                      .slice(0, 3);

                    const medallas = ['🥇 1er Lugar', '🥈 2do Lugar', '🥉 3er Lugar'];
                    const coloresMedalla = [
                      'bg-amber-50 border-amber-300 text-amber-900',
                      'bg-slate-50 border-slate-300 text-slate-800',
                      'bg-orange-50 border-orange-200 text-orange-900'
                    ];

                    return (
                      <div key={puestoItem} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h4 className="font-bold text-xs text-blue-950 uppercase tracking-wide mb-3">
                          📁 {puestoItem}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {top3Puesto.map((candidatoPodio, idx) => (
                            <div key={candidatoPodio.exam_id} className={`rounded-lg border p-3 text-xs flex flex-col justify-between ${coloresMedalla[idx]}`}>
                              <div>
                                <span className="font-extrabold text-[11px] block mb-1">{medallas[idx]}</span>
                                <p className="font-bold text-gray-900">{candidatoPodio.application_code}</p>
                                <p className="text-[11px] text-gray-600 mt-1">
                                  {candidatoPodio.identity_revealed ? candidatoPodio.full_name : 'Identidad protegida'}
                                </p>
                              </div>
                              <div className="mt-3 pt-2 border-t border-black/5 flex justify-between items-center font-bold">
                                <span className="text-[10px] text-gray-500">Puntaje:</span>
                                <span className="text-sm text-blue-900">{candidatoPodio.objective_score} / 100</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* histiorial de evaluaciones */}
              <section className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mt-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                  <h3 className="font-bold text-sm text-gray-900">Historial de evaluaciones general (Ranking)</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium bg-blue-50 text-blue-800 px-2.5 py-1 rounded-full">
                      Ordenado de mayor a menor puntaje
                    </span>
                    <button
                      type="button"
                      onClick={() => cargarDatos().catch((requestError) => setError(requestError.message))}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Actualizar
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-gray-400 border-b">
                        <th className="pb-3 font-medium">Ranking</th>
                        <th className="pb-3 font-medium">Cód. Eval</th>
                        <th className="pb-3 font-medium">Postulante</th>
                        <th className="pb-3 font-medium">Puesto</th>
                        <th className="pb-3 font-medium">Fecha</th>
                        <th className="pb-3 font-medium">Puntaje</th>
                        <th className="pb-3 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {evaluacionesConExamen
                        .sort((a, b) => (
                          Number(b.objective_score || 0) - Number(a.objective_score || 0)
                          || new Date(a.submitted_at) - new Date(b.submitted_at)
                          || a.application_code.localeCompare(b.application_code)
                        ))
                        .map((evaluacion, index) => {
                          const estado = Number(evaluacion.objective_score) < 100
                            ? 'No superó la valla'
                            : evaluacion.written_review_status === 'rejected'
                              ? 'Desarrollo no aprobado'
                              : evaluacion.identity_revealed
                                ? 'Valla superada'
                                : 'Pendiente de revisión';
                          return (
                            <tr key={evaluacion.exam_id} className="hover:bg-gray-50">
                              <td className="py-3 font-bold text-gray-600">
                                #{index + 1}
                              </td>
                              <td className="py-3 font-bold text-blue-950">
                                {evaluacion.application_code}
                                {evaluacion.is_demo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">PRUEBA</span>}
                              </td>
                              <td className="py-3 font-mono font-bold text-gray-800">
                                {evaluacion.identity_revealed ? (
                                  <>
                                    {evaluacion.full_name}
                                    {evaluacion.has_resume && (
                                      <a
                                        href={`/api/blind-selection/candidates/${evaluacion.id}/resume`}
                                        className="mt-1 block font-sans text-[10px] font-semibold text-blue-800 hover:underline"  >
                                        Descargar CV
                                      </a>
                                    )}
                                  </>
                                ) : 'Identidad protegida'}
                              </td>
                              <td className="py-3 text-gray-700">{evaluacion.position_title}</td>
                              <td className="py-3 text-gray-500">
                                {evaluacion.submitted_at ? new Date(evaluacion.submitted_at).toLocaleDateString('es-PE') : '—'}
                              </td>
                              <td className="py-3 font-bold text-blue-900">{evaluacion.objective_score} / 100</td>
                              <td className="py-3">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  estado === 'Valla superada' ? 'bg-emerald-100 text-emerald-800' :
                                  estado === 'No superó la valla' || estado === 'Desarrollo no aprobado'
                                    ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {estado}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      {!cargando && evaluacionesConExamen.length === 0 && (
                        <tr>
                          <td colSpan="7" className="py-6 text-center text-gray-500">
                            Aún no hay evaluaciones registradas.
                          </td>
                        </tr>
                      )}
                      {cargando && (
                        <tr><td colSpan="7" className="py-6 text-center text-gray-500">Cargando evaluaciones…</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {modo === 'preparacion' && (
            <section className="mx-auto w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <button
                type="button"
                onClick={() => setModo('historial')}
                className="mb-5 text-xs font-semibold text-blue-900 hover:underline" >
                ← Volver al historial
              </button>
              <h2 className="text-xl font-bold text-gray-900">Preparar evaluación técnica</h2>
              <p className="mt-1 text-xs text-gray-500">Usa el código anónimo del postulante para respetar la selección ciega.</p>

              <form onSubmit={iniciarEvaluacion} className="mt-5 space-y-4 text-xs">
                <div>
                  <label htmlFor="codigo-candidato" className="mb-1 block font-semibold text-gray-700">
                    Postulante (código ciego)
                  </label>
                  <select
                    id="codigo-candidato"
                    required
                    value={candidato}
                    className="w-full rounded-lg border border-gray-300 bg-white p-2.5"
                    disabled={cargando}
                    onChange={(event) => setCandidato(event.target.value)} >
                    <option value="">Selecciona un postulante</option>
                    {candidatos.filter((item) => !item.exam_id).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.application_code} · {item.position_title}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!candidato || !bancoSeleccionado}
                  className="rounded-lg bg-blue-950 px-4 py-2.5 font-semibold text-white hover:bg-blue-900 disabled:bg-gray-400" >
                  Comenzar prueba técnica
                </button>
              </form>
            </section>
          )}

          {modo === 'prueba' && preguntas.length > 0 && (
            <section className="mx-auto w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b pb-4 mb-5">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-1 rounded">
                    {candidatoSeleccionado?.application_code} · {puesto}
                  </span>
                  <h2 className="mt-2 text-lg font-bold text-gray-900">
                    Pregunta {indicePregunta + 1} de {preguntas.length}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={volverAlHistorial}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800" >
                  Cancelar prueba
                </button>
              </div>

              <div className="space-y-4">
                <p 
                  className="text-sm font-semibold text-gray-800 leading-relaxed select-none" 
                  onCopy={(e) => e.preventDefault()} >
                  {preguntas[indicePregunta].texto || preguntas[indicePregunta].enunciado || preguntas[indicePregunta].pregunta}
                </p>

                {preguntas[indicePregunta]?.tipo === 'opcion' ? (
                  <div className="space-y-2.5 pt-2">
                    {(preguntas[indicePregunta].opciones || []).map((opcion, idxOpcion) => {
                      const seleccionada = respuestas[indicePregunta] === idxOpcion;
                      return (
                        <label
                          key={idxOpcion}
                          className={`flex items-center gap-3 rounded-lg border p-3.5 text-xs cursor-pointer transition ${
                            seleccionada
                              ? 'border-blue-900 bg-blue-50/70 font-semibold text-blue-950'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}>
                          <input
                            type="radio"
                            name={`pregunta-${indicePregunta}`}
                            checked={seleccionada}
                            onChange={() =>
                              setRespuestas((prev) => ({ ...prev, [indicePregunta]: idxOpcion }))
                            }
                            className="text-blue-900 focus:ring-blue-900" />
                          <span>{opcion}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="pt-2">
                    <textarea
                      rows={4}
                      placeholder="Escribe tu respuesta de desarrollo aquí..."
                      value={respuestas[indicePregunta] || ''}
                      onChange={(e) =>
                        setRespuestas((prev) => ({ ...prev, [indicePregunta]: e.target.value }))
                      }
                      onPaste={(e) => {
                        e.preventDefault();
                        alert('Por seguridad, no está permitido pegar texto externo.');
                      }}
                      className="w-full rounded-lg border border-gray-300 p-3 text-xs focus:border-blue-900 focus:outline-none"/>
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between border-t pt-4">
                <button
                  type="button"
                  disabled={indicePregunta === 0}
                  onClick={() => setIndicePregunta((prev) => prev - 1)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40" >
                  ← Anterior
                </button>

                {indicePregunta < preguntas.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setIndicePregunta((prev) => prev + 1)}
                    className="rounded-lg bg-blue-950 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-900"  >
                    Siguiente →
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={finalizarEvaluacion}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-gray-400" >
                    {enviando ? 'Calificando…' : 'Finalizar y guardar examen'}
                  </button>
                )}
              </div>
            </section>
          )}

          {modo === 'resultado' && resultado && (
            <section className="mx-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl">
                📊
              </div>
              <h2 className="text-xl font-bold text-gray-900">Evaluación Registrada</h2>
              <p className="mt-1 text-xs text-gray-500">
                Resultados calculados automáticamente para el ranking de selección ciega.
              </p>

              <div className="my-6 rounded-xl bg-slate-50 p-4 border border-slate-200">
                <span className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                  Puntaje Obtenido
                </span>
                <span className="mt-1 block text-3xl font-extrabold text-blue-950">
                  {resultado.puntaje} / 100
                </span>
                <span className="mt-1 block text-[11px] text-gray-500">
                  Respuestas objetivas correctas: {resultado.correctas} de {resultado.totalObjetivas}
                </span>
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-0.5 text-[11px] font-bold ${
                    resultado.puntaje === 100
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`} >
                  {resultado.estado}
                </span>
              </div>

              <button
                type="button"
                onClick={volverAlHistorial}
                className="w-full rounded-lg bg-blue-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-900" >
                Volver al Ranking e Historial
              </button>
            </section>
          )}
        </main>
      </div>

      {candidatoWhatsApp && (
        <ModalNotificacionWhatsApp
          candidato={candidatoWhatsApp}
          etapa={etapaWhatsApp}
          onCerrar={() => setCandidatoWhatsApp(null)}/>
      )}
    </div>
  );
}