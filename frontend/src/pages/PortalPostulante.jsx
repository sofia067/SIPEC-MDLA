import { apiRequest } from '../services/api';
import { useEffect, useState } from 'react';

const dateInDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const documentTypes = [
  { type: 'professional_title', label: 'Título profesional o técnico' },
  { type: 'experience_certificate', label: 'Certificado de experiencia laboral' },
  { type: 'training_certificate', label: 'Certificados de capacitación' },
  { type: 'other_certificate', label: 'Otro certificado solicitado' },
];

const processStages = [
  { value: 'application_received', label: 'Postulación recibida' },
  { value: 'document_review', label: 'Revisión de documentos' },
  { value: 'exam', label: 'Examen' },
  { value: 'interview', label: 'Entrevista personal' },
  { value: 'practical', label: 'Práctica básica' },
  { value: 'final_result', label: 'Resultado final' },
];

const initialForm = {
  requestId: '',
  fullName: '',
  documentNumber: '',
  email: '',
  phone: '',
  demoConfirmation: false,
};

function PortalPostulante() {
  const [openings, setOpenings] = useState([]);
  const [cargandoOpenings, setCargandoOpenings] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [resume, setResume] = useState(null);
  const [additionalDocuments, setAdditionalDocuments] = useState({});
  const [fileInputKey, setFileInputKey] = useState(0);
  
  useEffect(() => {
    apiRequest('/public/applications/openings')
      .then((data) => {
        setOpenings(data.openings ?? []);
      })
      .catch(() => {
        setOpenings([]);
      })
      .finally(() => setCargandoOpenings(false));
  }, []);

  const [applications, setApplications] = useState(() => {
    const savedApplications = localStorage.getItem('sipec_candidate_demo_applications');
    if (!savedApplications) return [];
    try {
      const parsedApplications = JSON.parse(savedApplications);
      return Array.isArray(parsedApplications) ? parsedApplications : [];
    } catch {
      localStorage.removeItem('sipec_candidate_demo_applications');
      return [];
    }
  });

  const [applicationCode, setApplicationCode] = useState('');
  const [error, setError] = useState('');
  const [trackingForm, setTrackingForm] = useState({
    applicationCode: '',
    documentNumber: '',
  });
  const [progress, setProgress] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  
  const selectedOpening = openings.find((opening) => opening.id === form.requestId);

  const updateField = (event) => {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'requestId') {
      setAdditionalDocuments({});
      setError('');
    }
  };

  const validatePdf = (file) => file.type === 'application/pdf'
    && file.name.toLowerCase().endsWith('.pdf')
    && file.size > 0
    && file.size <= 5 * 1024 * 1024;

  const updateDocuments = (type, files) => {
    const selectedFiles = Array.from(files ?? []);
    const otherDocumentCount = Object.entries(additionalDocuments)
      .filter(([currentType]) => currentType !== type)
      .reduce((count, [, currentFiles]) => count + currentFiles.length, 0);

    if (otherDocumentCount + selectedFiles.length > 5) {
      setError('Puedes adjuntar hasta 5 certificados o títulos en total.');
      setAdditionalDocuments((current) => ({ ...current, [type]: [] }));
      return false;
    }
    if (selectedFiles.some((file) => !validatePdf(file))) {
      setError('Cada documento adjunto debe ser un PDF válido de hasta 5 MB.');
      setAdditionalDocuments((current) => ({ ...current, [type]: [] }));
      return false;
    }

    setAdditionalDocuments((current) => ({ ...current, [type]: selectedFiles }));
    setError('');
    return true;
  };

  const submitApplication = (event) => {
    event.preventDefault();
    setError('');
    
    if (!form.fullName || !form.documentNumber || !form.email || !form.phone) {
      setError('Por favor, completa todos tus datos personales de contacto.');
      return;
    }

    if (!resume || !validatePdf(resume)) {
      setError('Adjunta un currículum PDF válido de hasta 5 MB.');
      return;
    }

    // Validación dinámica según lo que exija la convocatoria seleccionada
    const missingRequired = (selectedOpening?.application_documents ?? [])
      .filter(({ type, required }) => required && !additionalDocuments[type]?.length)
      .map(({ type }) => documentTypes.find((item) => item.type === type)?.label)
      .filter(Boolean);
      
    if (missingRequired.length > 0) {
      setError(`Adjunta los documentos obligatorios requeridos: ${missingRequired.join(', ')}.`);
      return;
    }
    const numeroCorrelativo = String(applications.length + 1).padStart(2, '0');
    const code = `POSTULANTE-${numeroCorrelativo}`;
    const createdAt = new Date().toISOString();
    const newApplication = {
      applicationCode: code,
      documentNumber: form.documentNumber.trim().toUpperCase(),
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      positionTitle: selectedOpening?.position_title ?? 'Puesto de convocatoria',
      requestCode: selectedOpening?.code ?? 'DEMO',
      processStage: 'application_received',
      processStageUpdatedAt: createdAt,
      history: [
        {
          process_stage: 'application_received',
          created_at: createdAt,
          public_message: 'Tu postulación de demostración fue recibida.',
        },
      ],
    };

    const updatedApplications = [...applications, newApplication];
    try {
      localStorage.setItem('sipec_candidate_demo_applications', JSON.stringify(updatedApplications));
    } catch {
      setError('No se pudo guardar la postulación en este navegador.');
      return;
    }

    setApplications(updatedApplications);
    setApplicationCode(code);
    setTrackingForm({ applicationCode: code, documentNumber: form.documentNumber });
  };

  const startAnother = () => {
    setForm(initialForm);
    setResume(null);
    setAdditionalDocuments({});
    setFileInputKey((current) => current + 1);
    setApplicationCode('');
    setProgress(null);
    setTrackingError('');
    setError('');
  };

  const trackApplication = (event) => {
    event.preventDefault();
    setTrackingError('');
    setProgress(null);
    const found = applications.find((application) => (
      application.applicationCode.toUpperCase() === trackingForm.applicationCode.trim().toUpperCase()
      && application.documentNumber.toUpperCase() === trackingForm.documentNumber.trim().toUpperCase()
    ));
    if (!found) {
      setTrackingError('No se encontró una postulación con ese código y número de documento.');
      return;
    }
    setProgress(found);
  };

  const openApplicationStatus = (application) => {
    setTrackingForm({
      applicationCode: application.applicationCode,
      documentNumber: application.documentNumber,
    });
    setTrackingError('');
    setProgress(application);
  };

  return (
    <main className="applicant-portal min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white text-blue-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="/AquijesLogo.jpg" alt="Logo Los Aquijes" className="h-12 w-12 rounded-lg bg-blue-50 object-contain p-1" />
            <div>
              <p className="font-bold tracking-wide">SIPEC-MLA</p>
              <p className="text-xs text-slate-500">Portal de postulaciones</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/postulante/login" className="rounded-lg px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50">
              ¿Fuiste convocado? Iniciar sesión para examen
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-12">
        <section>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-full shadow-sm">
              <span>⚡</span>
              <span>Modo Demostración</span>
            </span>
          </div>
          <h1 className="mt-5 text-3xl font-bold leading-tight text-blue-950 sm:text-4xl">
            Convocatorias y postulaciones
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-slate-600">
            Explora convocatorias de ejemplo, completa tus datos de postulación y consulta el avance con tu código y documento.
          </p>

          <div className="mt-8 space-y-4">
            {[
              ['1', 'Elige una convocatoria', 'Revisa el puesto, los requisitos y los documentos solicitados.'],
              ['2', 'Completa tu postulación', 'Ingresa tus datos, adjunta tu CV y documentos opcionales u obligatorios según la plaza.'],
              ['3', 'Consulta el avance', 'Usa el código generado y tu número de documento.'],
            ].map(([number, title, detail]) => (
              <div key={number} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-900">{number}</span>
                <div>
                  <p className="font-semibold text-slate-800">{title}</p>
                  <p className="mt-1 text-sm text-slate-500">{detail}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-blue-950">Consulta el avance de tu postulación</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Ingresa el código de demostración y el documento registrado al postular.</p>
            
            {applications.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Postulaciones recientes en este equipo</h3>
                {applications.slice(-3).map((application) => (
                  <button
                    key={application.applicationCode}
                    type="button"
                    onClick={() => openApplicationStatus(application)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span><strong className="text-blue-950">{application.applicationCode}</strong><span className="ml-2 text-slate-600">{application.positionTitle}</span></span>
                    <span className="shrink-0 font-semibold text-blue-800">Ver estado</span>
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={trackApplication} className="mt-4 space-y-3">
              <div>
                <label htmlFor="tracking-application-code" className="mb-1 block text-xs font-semibold text-slate-700">Código de postulación</label>
                <input id="tracking-application-code" required maxLength={24} value={trackingForm.applicationCode} onChange={(event) => setTrackingForm((current) => ({ ...current, applicationCode: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Ejemplo: DEMO-XXXX" />
              </div>
              <div>
                <label htmlFor="tracking-document-number" className="mb-1 block text-xs font-semibold text-slate-700">DNI o documento registrado</label>
                <input id="tracking-document-number" required maxLength={24} value={trackingForm.documentNumber} onChange={(event) => setTrackingForm((current) => ({ ...current, documentNumber: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Número de documento" />
              </div>
              {trackingError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{trackingError}</p>}
              <button type="submit" className="w-full rounded-lg bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900">
                Consultar avance
              </button>
            </form>

            {progress && (
              <div className="mt-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-950">
                <p className="font-bold">{progress.positionTitle} · {progress.requestCode}</p>
                <p className="mt-2">Etapa actual: <strong>{processStages.find((stage) => stage.value === progress.processStage)?.label}</strong></p>
                <p className="mt-1 text-xs text-blue-800">Última actualización: {new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(progress.processStageUpdatedAt))}</p>
                <ol className="mt-4 space-y-3 border-l-2 border-blue-200 pl-4">
                  {progress.history.map((item, index) => (
                    <li key={`${item.created_at}-${index}`}>
                      <p className="font-semibold">{processStages.find((stage) => stage.value === item.process_stage)?.label ?? item.process_stage}</p>
                      <p className="text-xs text-blue-800">{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</p>
                      {item.public_message && <p className="mt-1 text-xs">{item.public_message}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {applicationCode ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800" aria-hidden="true">✓</div>
              <h2 className="mt-4 text-2xl font-bold text-blue-950">Postulación recibida con éxito</h2>
              <p className="mt-2 text-sm text-slate-600">Guarda este código y tu número de documento para consultar el avance en cualquier momento:</p>
              <p className="mt-4 inline-flex rounded-lg bg-blue-50 px-5 py-3 font-mono text-xl font-bold tracking-wider text-blue-950">{applicationCode}</p>
              <button type="button" onClick={startAnother} className="mt-7 rounded-lg bg-blue-950 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900">
                Registrar otra postulación
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-blue-950">Formulario de postulación</h2>
              <p className="mt-1 text-xs text-slate-500">Completa tus datos personales, selecciona el puesto y adjunta tus archivos en PDF.</p>
              {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

              <form onSubmit={submitApplication} className="mt-6 space-y-5">
                <div>
                  <label htmlFor="opening" className="mb-1.5 block text-sm font-semibold text-slate-700">Convocatoria</label>
                  <select id="opening" name="requestId" value={form.requestId} onChange={updateField} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="">Selecciona un puesto</option>
                    {openings.map((opening) => (
                      <option key={opening.id} value={opening.id}>{opening.position_title} · {opening.department} ({opening.code})</option>
                    ))}
                  </select>
                </div>

                {selectedOpening && (
                  <div className="rounded-lg bg-slate-50 p-4 text-xs space-y-2 border border-slate-200 text-slate-600">
                    <p className="font-semibold text-blue-950">Requisitos de la convocatoria:</p>
                    <p><strong>Educación:</strong> {selectedOpening.education}</p>
                    <p><strong>Exp. General:</strong> {selectedOpening.general_experience}</p>
                    <p><strong>Exp. Específica:</strong> {selectedOpening.specific_experience}</p>
                    <p><strong>Conocimientos:</strong> {selectedOpening.technical_knowledge}</p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="fullName" className="mb-1 block text-xs font-semibold text-slate-700">Nombres y apellidos</label>
                    <input id="fullName" name="fullName" type="text" required value={form.fullName} onChange={updateField} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none" placeholder="Tu nombre completo" />
                  </div>
                  <div>
                    <label htmlFor="documentNumber" className="mb-1 block text-xs font-semibold text-slate-700">DNI o documento</label>
                    <input id="documentNumber" name="documentNumber" type="text" required value={form.documentNumber} onChange={updateField} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none" placeholder="Nro de documento" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="email" className="mb-1 block text-xs font-semibold text-slate-700">Correo electrónico</label>
                    <input id="email" name="email" type="email" required value={form.email} onChange={updateField} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none" placeholder="nombre@correo.com" />
                  </div>
                  <div>
                    <label htmlFor="phone" className="mb-1 block text-xs font-semibold text-slate-700">Número de WhatsApp</label>
                    <input id="phone" name="phone" type="text" required value={form.phone} onChange={updateField} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none" placeholder="+51 900000000" />
                  </div>
                </div>

                <div>
                  <label htmlFor="resume" className="mb-1.5 block text-sm font-semibold text-slate-700">Currículum en PDF</label>
                  <input key={fileInputKey} id="resume" name="resume" type="file" accept="application/pdf,.pdf" required onChange={(event) => setResume(event.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-slate-300 text-sm file:mr-4 file:border-0 file:bg-blue-50 file:px-4 file:py-2.5 file:font-semibold file:text-blue-900 hover:file:bg-blue-100" />
                </div>

   {selectedOpening?.application_documents && selectedOpening.application_documents.length > 0 && (
  <div className="space-y-5">
    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Documentos de sustento (Opcionales para demostración):</p>
    {selectedOpening.application_documents.map(({ type }) => {
      const docInfo = documentTypes.find((d) => d.type === type);
      if (!docInfo) return null;
      return (
        <div key={type}>
          <label htmlFor={`doc-${type}`} className="mb-1.5 block text-sm font-semibold text-slate-700">
            {docInfo.label} <span className="text-xs font-normal text-slate-400">(Opcional)</span>
          </label>
          <input
            key={`${fileInputKey}-${type}`}
            id={`doc-${type}`}
            type="file"
            accept="application/pdf,.pdf"
            required={false} // <- Forzamos a que nunca sea obligatorio
            onChange={(e) => updateDocuments(type, e.target.files)}
            className="block w-full rounded-lg border border-slate-300 text-sm file:mr-4 file:border-0 file:bg-blue-50 file:px-4 file:py-2.5 file:font-semibold file:text-blue-900 hover:file:bg-blue-100"
          />
        </div>
      );
    })}
  </div>
)}
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                  <input name="demoConfirmation" type="checkbox" checked={form.demoConfirmation} onChange={updateField} required className="mt-1 h-4 w-4 shrink-0 accent-blue-900" />
                  <span>Confirmo que los datos y archivos son correctos para este proceso de postulación.</span>
                </label>

                <button type="submit" className="w-full rounded-lg bg-blue-950 px-5 py-3 font-semibold text-white transition hover:bg-blue-900">
                  Enviar postulación
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default PortalPostulante;