import { useState } from 'react';
import { apiRequest } from '../services/api';

export default function ModalNotificacionWhatsApp({ candidato, etapa, onCerrar }) {
  const [mensaje, setMensaje] = useState(() => {
    if (!candidato || etapa !== 'exam') return '';
    const enlaceExamen = `${window.location.origin}/postulante/examen-tecnico`;
    return `Hola ${candidato.full_name || candidato.fullName || 'Postulante'}, te saludamos de RR.HH. de la Municipalidad de Los Aquijes (SIPEC-MLA). ` +
      `Has avanzado a la etapa de EVALUACIÓN para el puesto de ${candidato.position_title || candidato.positionTitle}. ` +
      `Ingresa con tu código de postulación y la contraseña provisional que aparecen abajo: ${enlaceExamen}`;
  });
  const [error, setError] = useState('');
  const [generandoCredenciales, setGenerandoCredenciales] = useState(false);
  const [urlWhatsApp, setUrlWhatsApp] = useState('');
  
  // Buscamos el teléfono en cualquiera de los nombres posibles que pueda venir de la API
  const telefonoOriginal = candidato?.phone || candidato?.telefono || candidato?.celular || '';
  const [telefonoInput, setTelefonoInput] = useState(telefonoOriginal);

  const telefonoLimpio = telefonoInput.replace(/\D/g, '');

  const abrirWhatsApp = async () => {
    if (urlWhatsApp) {
      window.open(urlWhatsApp, '_blank', 'noopener,noreferrer');
      onCerrar();
      return;
    }
    setError('');
    setGenerandoCredenciales(true);
    const whatsappWindow = window.open('about:blank', '_blank');
    if (whatsappWindow) whatsappWindow.opener = null;
    try {
      let mensajeFinal = mensaje;
      let telefonoDestino = telefonoInput;
      if (etapa === 'exam') {
        const { credentials } = await apiRequest(`/blind-selection/candidates/${candidato.id}/exam-credentials`, {
          method: 'POST',
          body: JSON.stringify({ phone: telefonoInput || undefined }),
        });
        mensajeFinal += `\n\nCódigo de postulación: ${credentials.applicationCode}\nContraseña provisional: ${credentials.temporaryPassword}`;
        telefonoDestino = credentials.phone;
      }
      const destinationDigits = telefonoDestino.replace(/\D/g, '');
      const destinationNumber = destinationDigits.startsWith('51') ? destinationDigits : `51${destinationDigits}`;
      const url = `https://wa.me/${destinationNumber}?text=${encodeURIComponent(mensajeFinal)}`;
      if (whatsappWindow) {
        whatsappWindow.location.href = url;
        onCerrar();
      } else {
        setUrlWhatsApp(url);
      }
    } catch (requestError) {
      whatsappWindow?.close();
      setError(requestError.message || 'No se pudo preparar la notificación.');
    } finally {
      setGenerandoCredenciales(false);
    }
  };

  if (!candidato) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-sans text-xs">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-sm font-bold text-blue-950">
          Notificar por WhatsApp · {etapa === 'exam' ? 'Evaluación' : 'Entrevista Personal'}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Código: <strong>{candidato.application_code}</strong>
        </p>
        {etapa === 'exam' && (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-900">
            Se generará una contraseña temporal al preparar el mensaje. WhatsApp se abrirá con el texto listo; debes confirmar el envío manualmente.
          </p>
        )}

        {/* Campo para ingresar o corregir el número si no viene de la base de datos */}
        <div className="mt-3">
          <label className="mb-1 block font-semibold text-slate-700">
            Número de celular (WhatsApp):
          </label>
          <input
            type="text"
            value={telefonoInput}
            onChange={(e) => setTelefonoInput(e.target.value)}
            placeholder="Ej: 987654321"
            className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-700 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block font-semibold text-slate-700">
            {etapa === 'exam' 
              ? 'Plantilla automática asignada:' 
              : 'Redacta el mensaje indicando fecha, hora y disponibilidad:'}
          </label>
          <textarea
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            readOnly={etapa === 'exam'}
            placeholder={
              etapa === 'interview'
                ? 'Ej: Hola, quisiéramos coordinar tu entrevista personal para el día martes a las 10:00 a.m. ¿Confirmas tu disponibilidad?'
                : ''
            }
            className={`w-full rounded-lg border p-3 text-xs focus:outline-none ${
              etapa === 'exam'
                ? 'border-slate-200 bg-slate-100 text-slate-600'
                : 'border-slate-300 bg-white text-slate-800 focus:border-blue-700'
            }`}
          />
        </div>

        {error && <p role="alert" className="mt-3 rounded bg-red-50 p-2 text-[11px] text-red-700">{error}</p>}
        {urlWhatsApp && (
          <a
            href={urlWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-semibold text-emerald-700 underline"
          >
            Volver a abrir WhatsApp con las credenciales preparadas
          </a>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!mensaje.trim() || (etapa !== 'exam' && telefonoLimpio.length < 9) || (telefonoLimpio.length > 0 && telefonoLimpio.length < 9) || generandoCredenciales}
            onClick={abrirWhatsApp}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {generandoCredenciales ? 'Preparando…' : 'Abrir WhatsApp Web'}
          </button>
        </div>
      </div>
    </div>
  );
}