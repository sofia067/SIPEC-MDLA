import { useState, useEffect } from 'react';

export default function ModalNotificacionWhatsApp({ candidato, etapa, onCerrar }) {
  const [mensaje, setMensaje] = useState('');
  
  // Buscamos el teléfono en cualquiera de los nombres posibles que pueda venir de la API
  const telefonoOriginal = candidato?.phone || candidato?.telefono || candidato?.celular || '';
  const [telefonoInput, setTelefonoInput] = useState(telefonoOriginal);

  const telefonoLimpio = telefonoInput.replace(/\D/g, '');
  const numeroWhatsApp = telefonoLimpio.startsWith('51') ? telefonoLimpio : `51${telefonoLimpio}`;

  useEffect(() => {
    if (candidato) {
      const tel = candidato?.phone || candidato?.telefono || candidato?.celular || '';
      setTelefonoInput(tel);
    }

    if (!candidato) return;

    if (etapa === 'exam') {
      const enlaceExamen = `${window.location.origin}/postulante/examen-tecnico`;
      setMensaje(
        `Hola ${candidato.full_name || candidato.fullName || 'Postulante'}, te saludamos de RR.HH. de la Municipalidad de Los Aquijes (SIPEC-MLA). ` +
        `Has avanzado a la etapa de EVALUACIÓN para el puesto de ${candidato.position_title || candidato.positionTitle}. ` +
        `Por favor ingresa al siguiente enlace para rendir tu examen con tu correo registrado: ${enlaceExamen}`
      );
    } else if (etapa === 'interview') {
      setMensaje('');
    }
  }, [candidato, etapa]);

  const abrirWhatsApp = () => {
    const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onCerrar();
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
            disabled={!mensaje.trim() || telefonoLimpio.length < 9}
            onClick={abrirWhatsApp}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
          >
            Abrir WhatsApp Web
          </button>
        </div>
      </div>
    </div>
  );
}