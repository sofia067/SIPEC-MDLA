import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCandidateAuth } from '../auth/CandidateAuthContext';
import { apiRequest } from '../services/api';

export default function ExamenPostulante() {
  const { user, logout } = useCandidateAuth();
  const navigate = useNavigate();
  const [banco, setBanco] = useState(null);
  const [indicePregunta, setIndicePregunta] = useState(0);
  const [respuestas, setRespuestas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [examenIniciado, setExamenIniciado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(1800);
  const [fechaExpiracion, setFechaExpiracion] = useState(null);
  const autoSubmitAttempted = useRef(false);

  useEffect(() => {
    if (!user) {
      navigate('/postulante/login', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const cargarExamen = async () => {
      try {
        const { exam } = await apiRequest('/candidate-auth/exam');
        if (exam.submitted) {
          setResultado(exam);
          return;
        }
        setBanco({ puesto: exam.positionTitle, preguntas: exam.questions });
        setRespuestas(Object.fromEntries(
          exam.draft.map((answer, index) => [index, answer ?? '']),
        ));
        if (exam.expiresAt) {
          const expiresAt = new Date(exam.expiresAt);
          setFechaExpiracion(expiresAt);
          setTiempoRestante(Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)));
          setExamenIniciado(true);
        }
      } catch (requestError) {
        setError(requestError.message || 'No se pudo cargar el examen.');
      } finally {
        setCargando(false);
      }
    };
    if (user) cargarExamen();
  }, [user]);

  const preguntas = useMemo(() => banco?.preguntas ?? [], [banco]);
  const preguntaActual = preguntas[indicePregunta];

  const finalizarExamen = useCallback(async (respuestasActuales) => {
    if (enviando) return;
    setEnviando(true);
    setError('');
    try {
      const response = await apiRequest('/candidate-auth/exam/submit', {
        method: 'POST',
        body: JSON.stringify({
          answers: preguntas.map((question, index) => (
            respuestasActuales[index] === undefined
              ? (question.tipo === 'opcion' ? null : '')
              : respuestasActuales[index]
          )),
        }),
      });
      setResultado(response.exam);
    } catch (requestError) {
      setError(requestError.message || 'No se pudo registrar el examen. Intenta nuevamente.');
    } finally {
      setEnviando(false);
    }
  }, [enviando, preguntas]);

  useEffect(() => {
    if (!examenIniciado || !fechaExpiracion || resultado) return undefined;
    const interval = setInterval(() => {
      setTiempoRestante(Math.max(0, Math.ceil((fechaExpiracion.getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [examenIniciado, fechaExpiracion, resultado]);

  useEffect(() => {
    if (!examenIniciado || tiempoRestante !== 0 || resultado || enviando || autoSubmitAttempted.current) return;
    autoSubmitAttempted.current = true;
    finalizarExamen(respuestas);
  }, [tiempoRestante, examenIniciado, resultado, enviando, respuestas, finalizarExamen]);

  useEffect(() => {
    if (!examenIniciado || !fechaExpiracion || resultado) return undefined;
    const timeout = setTimeout(async () => {
      try {
        await apiRequest('/candidate-auth/exam/draft', {
          method: 'PUT',
          body: JSON.stringify({
            answers: preguntas.map((question, index) => (
              respuestas[index] === undefined
                ? (question.tipo === 'opcion' ? null : '')
                : respuestas[index]
            )),
          }),
        });
      } catch (requestError) {
        if (requestError.code !== 'EXAM_TIME_EXPIRED') setError(requestError.message);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [respuestas, preguntas, examenIniciado, fechaExpiracion, resultado]);

  const comenzarExamen = async () => {
    setError('');
    try {
      const attempt = await apiRequest('/candidate-auth/exam/start', { method: 'POST' });
      const expiresAt = new Date(attempt.expiresAt);
      setFechaExpiracion(expiresAt);
      setTiempoRestante(Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)));
      setRespuestas(Object.fromEntries(attempt.draft.map((answer, index) => [index, answer ?? ''])));
      setExamenIniciado(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const cerrarSesion = async () => {
    try {
      await logout();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const formatTiempo = (segundos) => {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-xs font-sans text-slate-500">
        Cargando evaluación técnica…
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-slate-100 font-sans text-slate-800">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-center justify-between border-b bg-white px-4 sm:px-6 py-3 sm:py-4 gap-3 sm:gap-0 shadow-sm">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3">
            <img src="/AquijesLogo.jpg" alt="Logo Los Aquijes" className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-slate-50 object-contain p-1" />
            <div>
              <h1 className="text-xs sm:text-sm font-bold text-blue-950">SIPEC-MLA · Evaluación Técnica</h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500">Municipalidad de Los Aquijes</p>
            </div>
          </div>
          
          <button onClick={cerrarSesion} className="sm:hidden flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline">
            <span>❌</span> Cerrar sesión
          </button>
        </div>

        {/* Cronómetro */}
        <div className="flex justify-center w-full sm:w-auto">
          {examenIniciado && !resultado && (
            <div className={`flex items-center gap-2 rounded-xl px-3 sm:px-4 py-1.5 text-xs font-bold shadow-sm border ${tiempoRestante < 300 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-blue-50/80 text-blue-900 border-blue-100'}`}>
              <span>⏱️ Tiempo restante: {formatTiempo(tiempoRestante)}</span>
            </div>
          )}
        </div>

        
        <div className="hidden sm:flex justify-end">
          <button onClick={cerrarSesion} className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline">
            <span>❌</span> Cerrar sesión
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
        <section className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-8 shadow-xl">
          {error && (
            <div className="mb-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {!examenIniciado ? (
            /* Bienvenida */
            <div className="py-2 sm:py-4">
              <div className="border-b pb-4 mb-6">
                <span className="rounded bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">
                  Proceso de Selección Ciega - SIPEC-MLA
                </span>
                <h2 className="mt-3 text-lg sm:text-xl font-extrabold text-slate-900">
                  Evaluación de Competencias Técnicas
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Postulación para: <span className="font-bold text-slate-700">{banco?.puesto}</span>
                </p>
              </div>

              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 text-xs text-slate-700 leading-relaxed">
                <p className="font-bold text-slate-900">Estimado(a) postulante, por favor tenga en cuenta las siguientes indicaciones oficiales:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong className="text-slate-900">Duración de la evaluación:</strong> Cuenta con un tiempo máximo de <span className="font-bold text-blue-950">30 minutos</span> continuos. Una vez iniciado, el cronómetro no se detendrá.</li>
                  <li><strong className="text-slate-900">Estructura:</strong> El cuestionario consta de preguntas de opción múltiple y casos prácticos desarrollados conforme al perfil profesional requerido.</li>
                  <li><strong className="text-slate-900">Seguridad y Restricciones:</strong> Por normativas del proceso de selección, está prohibido el uso de atajos de copia y pega en las evaluaciones.</li>
                  <li><strong className="text-slate-900">Envío automático:</strong> Al finalizar el tiempo límite, el sistema registrará y enviará automáticamente sus respuestas actuales.</li>
                </ul>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t pt-6 gap-4">
                <p className="text-[11px] text-slate-400 text-center sm:text-left">
                  Municipalidad de Los Aquijes · Sistema de Selección Ciega
                </p>
                <button
                  type="button"
                  disabled={!banco || !preguntas.length}
                  onClick={comenzarExamen}
                  className="w-full sm:w-auto rounded-xl bg-blue-950 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-blue-900 transition disabled:cursor-not-allowed disabled:bg-slate-400" >
                  Comenzar Evaluación Técnica →
                </button>
              </div>
            </div>
          ) : !resultado ? (
          
            preguntas.length > 0 ? (
              <div 
                onCopy={(e) => e.preventDefault()} 
                onCut={(e) => e.preventDefault()} 
                className="select-none" >
                {/* Selector rápido de preguntas (Grid numérico superior) */}
                <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Navegación de preguntas:</span>
                    <span className="text-[11px] font-semibold text-slate-500">{banco?.puesto}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {preguntas.map((_, idx) => {
                      const respondida = respuestas[idx] !== undefined && respuestas[idx] !== '';
                      const actual = idx === indicePregunta;
                      return (
                        <button
                          key={idx}
                          onClick={() => setIndicePregunta(idx)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                            actual
                              ? 'ring-2 ring-blue-950 bg-blue-900 text-white shadow-md'
                              : respondida
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}   >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-6 flex items-center justify-between border-b pb-3">
                  <span className="rounded bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">
                    Pregunta {indicePregunta + 1} de {preguntas.length}
                  </span>
                </div>

                <h2 className="mb-5 text-sm sm:text-base font-bold leading-relaxed text-slate-900">
                  {preguntaActual.texto}
                </h2>

                {preguntaActual.tipo === 'opcion' ? (
                  <div className="space-y-3">
                    {(preguntaActual.opciones || []).map((opcion, idx) => {
                      const seleccionada = respuestas[indicePregunta] === idx;
                      return (
                        <label
                          key={idx}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-xs sm:text-sm transition ${
                            seleccionada
                              ? 'border-blue-900 bg-blue-50/70 font-bold text-blue-950 shadow-sm'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`} >
                          <input
                            type="radio"
                            name={`pregunta-${indicePregunta}`}
                            checked={seleccionada}
                            onChange={() => setRespuestas((prev) => ({ ...prev, [indicePregunta]: idx }))}
                            className="h-4 w-4 text-blue-900 focus:ring-blue-900"
                          />
                          <span>{opcion}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <textarea
                      rows={5}
                      placeholder="Escribe tu respuesta desarrollada o caso práctico aquí..."
                      value={respuestas[indicePregunta] || ''}
                      onChange={(e) => setRespuestas((prev) => ({ ...prev, [indicePregunta]: e.target.value }))}
                      onPaste={(e) => {
                        e.preventDefault();
                        alert('Por seguridad, no está permitido pegar texto externo en la evaluación.');
                      }}
                      className="w-full rounded-xl border border-slate-300 p-4 text-xs sm:text-sm focus:border-blue-900 focus:outline-none"
                    />
                  </div>
                )}

                <div className="mt-8 flex items-center justify-between border-t pt-4">
                  <button
                    type="button"
                    disabled={indicePregunta === 0}
                    onClick={() => setIndicePregunta((prev) => prev - 1)}
                    className="rounded-lg border border-slate-300 px-4 sm:px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" >
                    ← Anterior
                  </button>

                  {indicePregunta < preguntas.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setIndicePregunta((prev) => prev + 1)}
                      className="rounded-lg bg-blue-950 px-5 sm:px-6 py-2.5 text-xs font-semibold text-white hover:bg-blue-900 shadow-sm">
                      Siguiente →
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => finalizarExamen(respuestas)}
                      className="rounded-lg bg-emerald-600 px-5 sm:px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-slate-400 shadow-sm" >
                      {enviando ? 'Enviando examen…' : 'Finalizar y enviar examen'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">
                No hay preguntas configuradas para este puesto.
              </p>
            )
          ) : (
            /* Resultados finales */
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-800">
                ✓
              </div>
              <h2 className="text-xl font-bold text-slate-900">¡Examen enviado con éxito!</h2>
              <p className="mt-1 text-xs text-slate-500">
                Tus respuestas han sido registradas correctamente en el sistema de selección ciega.
              </p>

              <div className="my-6 rounded-xl border border-slate-200 bg-slate-50 p-4 max-w-xs mx-auto">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Puntaje Objetivo</span>
                <p className="mt-1 text-3xl font-extrabold text-blue-950">{resultado.objectiveScore} / 100</p>
                {resultado.correctAnswers !== null && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Respuestas correctas: {resultado.correctAnswers} de {resultado.totalObjectiveQuestions}
                  </p>
                )}
              </div>

              <button
                onClick={cerrarSesion}
                className="rounded-lg bg-blue-950 px-6 py-2.5 text-xs font-semibold text-white hover:bg-blue-900" >
                Salir del portal
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}