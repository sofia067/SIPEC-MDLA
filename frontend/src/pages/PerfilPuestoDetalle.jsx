import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/sidebar';
import UserDropdown from '../components/UserDropdown';
import { apiRequest } from '../services/api';
import { useAuth } from '../auth/AuthContext';

const RANGOS_POR_NIVEL = {
  'Técnico / Campo': { min: 1000, max: 3500 },
  'Técnico / Operativo': { min: 1000, max: 3500 },
  Técnico: { min: 1000, max: 3500 },
  Profesional: { min: 2000, max: 9000 },
};

const RANGO_GENERAL = { min: 0.01, max: 15000 };

function obtenerRangoRemuneracion(nivel) {
  return RANGOS_POR_NIVEL[String(nivel ?? '').trim()] ?? RANGO_GENERAL;
}

function formatearMoneda(monto) {
  return `S/ ${Number(monto).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function sanitizarRemuneracionInput(rawValue) {
  let cleaned = String(rawValue ?? '')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '');

  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex !== -1) {
    const integerPart = cleaned.slice(0, firstDotIndex + 1);
    const decimalPart = cleaned
      .slice(firstDotIndex + 1)
      .replace(/\./g, '')
      .slice(0, 2);
    cleaned = `${integerPart}${decimalPart}`;
  }

  return cleaned;
}

function sanitizarSoloLetras(rawValue) {
  return String(rawValue ?? '')
    .replace(/[0-9]/g, '')
    .replace(/[^A-Za-zÁÉÍÓÚÜáéíóúüÑñ\s.,;:/()-]/g, '');
}

function sanitizarCodigoPerfil(rawValue) {
  return String(rawValue ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

const splitLines = (value) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatMoney = (value) =>
  value == null
    ? 'No especificada'
    : `S/ ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

const tabs = [
  { id: 'general', label: 'Información general' },
  { id: 'requisitos', label: 'Requisitos y competencias' },
  { id: 'responsabilidades', label: 'Responsabilidades' },
];

const emptyWarnings = {
  title: null,
  profileCode: null,
  education: null,
  generalExperience: null,
  specificExperience: null,
  technicalKnowledge: null,
  principalRequirements: null,
  description: null,
  competencies: null,
  functions: null,
  remuneration: null,
};

function toForm(profile) {
  return {
    title: profile.title || '',
    department: profile.department || '',
    level: profile.level || '',
    profileCode: profile.profile_code || '',
    remuneration: profile.remuneration ?? '',
    education: profile.education || '',
    generalExperience: profile.general_experience || '',
    specificExperience: profile.specific_experience || '',
    technicalKnowledge: profile.technical_knowledge || '',
    principalRequirements: profile.principal_requirements || '',
    description: profile.description || '',
    competencies: (profile.competencies || []).map(({ name }) => name).join('\n'),
    functions: (profile.functions || []).join('\n'),
  };
}

function getInputClasses(feedback, extraClasses = '') {
  let stateClasses =
    'border-gray-300 focus:border-blue-900 focus:ring-1 focus:ring-blue-900/20';

  if (feedback?.severity === 'error') {
    stateClasses =
      'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-400/20';
  } else if (feedback?.severity === 'warning') {
    stateClasses =
      'border-amber-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20';
  }

  return `w-full rounded-lg border bg-white p-2 text-sm text-gray-800 transition-colors focus:outline-none ${stateClasses} ${extraClasses}`;
}

function getFeedbackBoxClasses(severity) {
  if (severity === 'error') {
    return 'mt-1 block rounded-md border border-red-200/80 bg-red-50/70 px-2.5 py-1 text-xs text-red-700';
  }
  return 'mt-1 block rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-1 text-xs text-amber-800';
}

function Field({
  label,
  helperText,
  feedback,
  value,
  onChange,
  onKeyDown,
  onBeforeInput,
  rows = 1,
  type = 'text',
  inputMode,
  placeholder,
  required = false,
}) {
  const inputClass = getInputClasses(feedback, 'mt-1');

  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {rows > 1 ? (
        <textarea
          className={inputClass}
          rows={rows}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBeforeInput={onBeforeInput}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          className={inputClass}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBeforeInput={onBeforeInput}
          placeholder={placeholder}
          required={required}
        />
      )}
      {feedback?.message && (
        <span role="alert" className={getFeedbackBoxClasses(feedback.severity)}>
          {feedback.message}
        </span>
      )}
      {helperText && (
        <span className="mt-1 block text-xs font-normal text-gray-500">{helperText}</span>
      )}
    </label>
  );
}

function ReadField({ label, value, empty = 'No especificada' }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</h3>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-800">
        {value || empty}
      </p>
    </div>
  );
}

export default function PerfilPuestoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEditar = ['admin', 'hr_specialist'].includes(user?.role);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [warnings, setWarnings] = useState(emptyWarnings);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [tabActiva, setTabActiva] = useState('general');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setWarnings(emptyWarnings);
    apiRequest('/profiles', { timeoutMs: 15000 })
      .then(({ profiles }) => {
        const currentProfile = profiles.find((item) => item.id === id);
        if (!currentProfile) throw new Error('No se encontró el perfil solicitado.');
        if (cancelled) return;
        setProfile(currentProfile);
        setForm(toForm(currentProfile));
        setError('');
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, intentoCarga]);

  function updateField(name, value) {
    if (error) setError('');
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSoloLetrasKeyDown(fieldName) {
    return (event) => {
      if (
        /^[0-9]$/.test(event.key) ||
        (event.code?.startsWith('Numpad') && /[0-9]/.test(event.key))
      ) {
        event.preventDefault();
        setWarnings((prev) => ({
          ...prev,
          [fieldName]: {
            message: 'Solo se permiten letras; no se aceptan números.',
            severity: 'warning',
          },
        }));
      }
    };
  }

  function handleSoloLetrasBeforeInput(fieldName) {
    return (event) => {
      const data = event.data ?? '';
      if (/[0-9]/.test(data)) {
        event.preventDefault();
        setWarnings((prev) => ({
          ...prev,
          [fieldName]: {
            message: 'Solo se permiten letras; no se aceptan números.',
            severity: 'warning',
          },
        }));
      }
    };
  }

  function handleSoloLetrasChange(fieldName) {
    return (event) => {
      const rawValue = event.target.value;
      const sanitized = sanitizarSoloLetras(rawValue);
      const tuvoNumeros = /[0-9]/.test(rawValue);

      setWarnings((prev) => ({
        ...prev,
        [fieldName]: tuvoNumeros
          ? {
              message: 'Solo se permiten letras; no se aceptan números.',
              severity: 'warning',
            }
          : rawValue !== sanitized
            ? {
                message: 'Solo se permiten letras y signos básicos.',
                severity: 'warning',
              }
            : null,
      }));

      updateField(fieldName, sanitized);
    };
  }

  function soloLetrasProps(fieldName, label, extra = {}) {
    return {
      label,
      helperText: 'Solo letras (no se aceptan números).',
      feedback: warnings[fieldName],
      value: form[fieldName],
      onChange: handleSoloLetrasChange(fieldName),
      onKeyDown: handleSoloLetrasKeyDown(fieldName),
      onBeforeInput: handleSoloLetrasBeforeInput(fieldName),
      ...extra,
    };
  }

  function handleCodeChange(event) {
    const rawValue = event.target.value;
    const sanitized = sanitizarCodigoPerfil(rawValue);
    setWarnings((prev) => ({
      ...prev,
      profileCode:
        rawValue !== sanitized
          ? {
              message: 'Solo se permiten letras, números y guiones.',
              severity: 'warning',
            }
          : null,
    }));
    updateField('profileCode', sanitized);
  }

  function handleRemunerationChange(event) {
    const rawValue = event.target.value;
    const sanitized = sanitizarRemuneracionInput(rawValue);
    const intentoLetrasOSimbolos = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ-]/.test(rawValue);

    if (sanitized !== '' && Number(sanitized) === 0 && !sanitized.endsWith('.')) {
      const msg = 'Ingresa un monto mayor a cero.';
      setWarnings((prev) => ({
        ...prev,
        remuneration: { message: msg, severity: 'error' },
      }));
      setError(`Remuneración referencial (S/): ${msg}`);
      updateField('remuneration', '');
      return;
    }

    setWarnings((prev) => ({
      ...prev,
      remuneration: intentoLetrasOSimbolos
        ? {
            message: 'Solo se aceptan números positivos.',
            severity: 'warning',
          }
        : null,
    }));

    updateField('remuneration', sanitized);
  }

  function handleRemunerationKeyDown(event) {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      const msg =
        event.key === '-'
          ? 'No se aceptan montos negativos.'
          : 'Solo se aceptan números positivos.';
      setWarnings((prev) => ({
        ...prev,
        remuneration: { message: msg, severity: 'warning' },
      }));
      event.preventDefault();
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    setWarnings(emptyWarnings);

    const cleanTitle = sanitizarSoloLetras(form.title).trim();
    if (!cleanTitle || !/[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]/.test(cleanTitle)) {
      const msg = 'Solo se permiten letras; no puede quedar vacío.';
      setWarnings((prev) => ({
        ...prev,
        title: { message: msg, severity: 'error' },
      }));
      setError(`Nombre del puesto: ${msg}`);
      return;
    }

    const camposLetras = [
      { key: 'education', label: 'Formación académica', tab: 'general' },
      { key: 'generalExperience', label: 'Experiencia general', tab: 'general' },
      { key: 'specificExperience', label: 'Experiencia específica', tab: 'general' },
      { key: 'technicalKnowledge', label: 'Conocimientos técnicos', tab: 'general' },
      { key: 'principalRequirements', label: 'Otros requisitos', tab: 'general' },
      { key: 'competencies', label: 'Competencias', tab: 'general' },
      { key: 'description', label: 'Misión / descripción', tab: 'requisitos' },
      { key: 'functions', label: 'Funciones principales', tab: 'responsabilidades' },
    ];

    for (const campo of camposLetras) {
      if (/[0-9]/.test(String(form[campo.key] || ''))) {
        const msg = 'Solo se permiten letras; no se aceptan números.';
        setWarnings((prev) => ({
          ...prev,
          [campo.key]: { message: msg, severity: 'error' },
        }));
        setError(`${campo.label}: ${msg}`);
        return;
      }
    }

    const rangoActual = obtenerRangoRemuneracion(form.level);
    const nivelTexto = String(form.level || '').trim();
    let parsedSalary = null;

    if (form.remuneration !== '' && form.remuneration !== null && form.remuneration !== undefined) {
      parsedSalary = Number(form.remuneration);
      if (Number.isNaN(parsedSalary) || !Number.isFinite(parsedSalary)) {
        const msg = 'Solo se aceptan números válidos.';
        setWarnings((prev) => ({
          ...prev,
          remuneration: { message: msg, severity: 'error' },
        }));
        setError(`Remuneración referencial (S/): ${msg}`);
        return;
      }
      if (parsedSalary <= 0) {
        const msg = 'Ingresa un monto mayor a cero.';
        setWarnings((prev) => ({
          ...prev,
          remuneration: { message: msg, severity: 'error' },
        }));
        setError(`Remuneración referencial (S/): ${msg}`);
        return;
      }
      if (parsedSalary < rangoActual.min || parsedSalary > rangoActual.max) {
        const msg = nivelTexto
          ? `Debe estar entre ${formatearMoneda(rangoActual.min)} y ${formatearMoneda(rangoActual.max)} para ${nivelTexto}.`
          : `Debe estar entre ${formatearMoneda(rangoActual.min)} y ${formatearMoneda(rangoActual.max)}.`;
        setWarnings((prev) => ({
          ...prev,
          remuneration: { message: msg, severity: 'error' },
        }));
        setError(`Remuneración referencial (S/): ${msg}`);
        return;
      }
    }

    setSaving(true);
    try {
      const oldCompetencies = new Map(
        (profile.competencies || []).map((competency) => [competency.name, competency.description])
      );
      const cleanCompetenciesLines = splitLines(sanitizarSoloLetras(form.competencies));

      await apiRequest(`/profiles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: cleanTitle,
          department: String(form.department || '').trim(),
          level: String(form.level || '').trim(),
          profileCode: sanitizarCodigoPerfil(form.profileCode).trim(),
          remuneration: parsedSalary,
          education: sanitizarSoloLetras(form.education).trim(),
          generalExperience: sanitizarSoloLetras(form.generalExperience).trim(),
          specificExperience: sanitizarSoloLetras(form.specificExperience).trim(),
          technicalKnowledge: sanitizarSoloLetras(form.technicalKnowledge).trim(),
          principalRequirements: sanitizarSoloLetras(form.principalRequirements).trim(),
          description: sanitizarSoloLetras(form.description).trim(),
          status: profile.status,
          competencies: cleanCompetenciesLines.map((name) => ({
            name,
            description: oldCompetencies.get(name) || '',
          })),
          functions: splitLines(sanitizarSoloLetras(form.functions)),
        }),
      });
      const { profiles } = await apiRequest('/profiles');
      const updatedProfile = profiles.find((item) => item.id === id);
      setProfile(updatedProfile);
      setForm(toForm(updatedProfile));
      setWarnings(emptyWarnings);
      setEditing(false);
    } catch (requestError) {
      setError(`No se pudieron guardar los cambios: ${requestError.message}`);
    } finally {
      setSaving(false);
    }
  }

  const competencies = profile?.competencies || [];
  const functions = profile?.functions || [];
  const requisitos = [
    { label: 'Formación académica', value: profile?.education },
    { label: 'Experiencia general', value: profile?.general_experience },
    { label: 'Experiencia específica', value: profile?.specific_experience },
    { label: 'Conocimientos técnicos', value: profile?.technical_knowledge },
    { label: 'Otros requisitos', value: profile?.principal_requirements },
  ];

  const rangoActual = obtenerRangoRemuneracion(form?.level);
  const textoAyudaRemuneracion = String(form?.level || '').trim()
    ? `Rango: ${formatearMoneda(rangoActual.min)} a ${formatearMoneda(rangoActual.max)} (${String(form.level).trim()}). Ingresa un monto mayor a cero.`
    : `Rango: ${formatearMoneda(rangoActual.min)} a ${formatearMoneda(rangoActual.max)}. Ingresa un monto mayor a cero.`;

  return (
    <div className="app-shell flex h-dvh flex-col bg-gray-100 font-sans text-gray-800 md:flex-row">
      <Sidebar />
      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-y-auto">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-blue-950">SIPEC-MLA</h1>
            <span className="hidden rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 sm:inline">
              Perfil del puesto
            </span>
          </div>
          <UserDropdown />
        </header>

        <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/perfil-puesto')}
              className="text-sm font-semibold text-blue-900 hover:underline"
            >
              ← Volver a perfiles
            </button>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              04. Perfil del puesto
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200/80 bg-red-50/70 px-4 py-3 text-sm text-red-700"
            >
              <p>{error}</p>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setIntentoCarga((intento) => intento + 1)}
                  className="mt-2 font-semibold underline"
                >
                  Reintentar
                </button>
              )}
            </div>
          )}

          {loading && <p className="rounded-lg bg-white p-6 text-sm text-gray-500">Cargando ficha...</p>}

          {!loading && profile && form && (
            <form onSubmit={saveProfile} className="space-y-5">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      {editing ? (
                        <div className="w-full max-w-xl">
                          <input
                            aria-label="Nombre del puesto"
                            required
                            value={form.title}
                            onChange={handleSoloLetrasChange('title')}
                            onKeyDown={handleSoloLetrasKeyDown('title')}
                            onBeforeInput={handleSoloLetrasBeforeInput('title')}
                            className={getInputClasses(warnings.title, 'text-xl font-bold')}
                          />
                          {warnings.title?.message && (
                            <p
                              role="alert"
                              className={getFeedbackBoxClasses(warnings.title.severity)}
                            >
                              {warnings.title.message}
                            </p>
                          )}
                        </div>
                      ) : (
                        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{profile.title}</h2>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          profile.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {profile.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    {editing ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Área / unidad orgánica"
                          value={form.department}
                          onChange={(event) => updateField('department', event.target.value)}
                        />
                        <Field
                          label="Código del perfil"
                          value={form.profileCode}
                          feedback={warnings.profileCode}
                          onChange={handleCodeChange}
                        />
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">
                        {profile.department}
                        {profile.profile_code ? ` · ${profile.profile_code}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {editing && puedeEditar ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setForm(toForm(profile));
                            setWarnings(emptyWarnings);
                            setError('');
                            setEditing(false);
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:bg-gray-400"
                        >
                          {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                      </>
                    ) : puedeEditar ? (
                      <button
                        type="button"
                        onClick={() => {
                          setWarnings(emptyWarnings);
                          setError('');
                          setEditing(true);
                        }}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Editar perfil
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              <nav
                role="tablist"
                aria-label="Secciones del perfil"
                className="flex gap-1 overflow-x-auto border-b border-gray-200"
              >
                {tabs.map(({ id: tabId, label }) => (
                  <button
                    key={tabId}
                    type="button"
                    role="tab"
                    aria-selected={tabActiva === tabId}
                    onClick={() => setTabActiva(tabId)}
                    className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      tabActiva === tabId
                        ? 'border-blue-900 text-blue-950'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {tabActiva === 'general' && (
                <section className="grid items-start gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <h3 className="text-base font-bold text-gray-900">Requisitos mínimos</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Condiciones necesarias para desempeñar el puesto.
                    </p>
                    {editing ? (
                      <div className="mt-5 space-y-4">
                        <Field {...soloLetrasProps('education', 'Formación académica', { rows: 2 })} />
                        <Field
                          {...soloLetrasProps('generalExperience', 'Experiencia general', { rows: 2 })}
                        />
                        <Field
                          {...soloLetrasProps('specificExperience', 'Experiencia específica', {
                            rows: 2,
                          })}
                        />
                        <Field
                          {...soloLetrasProps('technicalKnowledge', 'Conocimientos técnicos', {
                            rows: 3,
                          })}
                        />
                        <Field
                          {...soloLetrasProps('principalRequirements', 'Otros requisitos', {
                            rows: 2,
                          })}
                        />
                      </div>
                    ) : (
                      <div className="mt-4 divide-y divide-gray-100">
                        {requisitos.map(({ label, value }) => (
                          <div key={label} className="flex gap-3 py-3 first:pt-1 last:pb-1">
                            <span
                              aria-hidden="true"
                              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-900"
                            >
                              ✓
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-gray-800">{label}</h4>
                              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                                {value || 'No especificado.'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <h3 className="text-base font-bold text-gray-900">Competencias requeridas</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Habilidades y capacidades asociadas al puesto.
                    </p>
                    {editing ? (
                      <div className="mt-5 space-y-4">
                        <Field
                          {...soloLetrasProps('competencies', 'Competencias (una por línea)', {
                            rows: 7,
                          })}
                        />
                        <Field
                          label="Nivel / grupo"
                          value={form.level}
                          onChange={(event) => {
                            setWarnings((prev) => ({ ...prev, remuneration: null }));
                            updateField('level', event.target.value);
                          }}
                        />
                        <Field
                          label="Remuneración referencial (S/)"
                          helperText={textoAyudaRemuneracion}
                          feedback={warnings.remuneration}
                          type="text"
                          inputMode="decimal"
                          placeholder="Ej. 2500.00"
                          value={form.remuneration}
                          onChange={handleRemunerationChange}
                          onKeyDown={handleRemunerationKeyDown}
                        />
                      </div>
                    ) : competencies.length ? (
                      <ul className="mt-4 divide-y divide-gray-100">
                        {competencies.map(({ id: competencyId, name, description }) => (
                          <li
                            key={competencyId || name}
                            className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-1"
                          >
                            <div className="flex min-w-0 gap-3">
                              <span
                                aria-hidden="true"
                                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700"
                              >
                                ✓
                              </span>
                              <div>
                                <span className="text-sm font-medium text-gray-800">{name}</span>
                                {description && (
                                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                    {description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                              Requerida
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                        No se registraron competencias para este puesto.
                      </p>
                    )}
                    {!editing && (
                      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-900">
                        Nivel / grupo del puesto:{' '}
                        <span className="font-semibold">{profile.level || 'No especificado'}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {tabActiva === 'requisitos' && (
                <section className="grid items-start gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <h3 className="text-base font-bold text-gray-900">Datos del perfil</h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      {editing ? (
                        <>
                          <Field
                            label="Código del perfil"
                            value={form.profileCode}
                            feedback={warnings.profileCode}
                            onChange={handleCodeChange}
                          />
                          <Field
                            label="Nivel / grupo"
                            value={form.level}
                            onChange={(event) => {
                              setWarnings((prev) => ({ ...prev, remuneration: null }));
                              updateField('level', event.target.value);
                            }}
                          />
                          <div className="sm:col-span-2">
                            <Field
                              label="Remuneración referencial (S/)"
                              helperText={textoAyudaRemuneracion}
                              feedback={warnings.remuneration}
                              type="text"
                              inputMode="decimal"
                              placeholder="Ej. 2500.00"
                              value={form.remuneration}
                              onChange={handleRemunerationChange}
                              onKeyDown={handleRemunerationKeyDown}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <ReadField label="Código" value={profile.profile_code} />
                          <ReadField label="Nivel / grupo" value={profile.level} />
                          <ReadField
                            label="Remuneración referencial"
                            value={
                              profile.remuneration == null ? '' : formatMoney(profile.remuneration)
                            }
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <h3 className="text-base font-bold text-gray-900">Descripción del puesto</h3>
                    <div className="mt-4">
                      {editing ? (
                        <Field
                          {...soloLetrasProps('description', 'Misión / descripción', { rows: 6 })}
                        />
                      ) : (
                        <ReadField label="Misión / descripción" value={profile.description} />
                      )}
                    </div>
                  </div>
                </section>
              )}

              {tabActiva === 'responsabilidades' && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-base font-bold text-gray-900">Responsabilidades</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Funciones principales asignadas al puesto.
                  </p>
                  {editing ? (
                    <div className="mt-5">
                      <Field
                        {...soloLetrasProps('functions', 'Funciones principales (una por línea)', {
                          rows: 10,
                        })}
                      />
                    </div>
                  ) : functions.length ? (
                    <ol className="mt-5 space-y-3">
                      {functions.map((item, index) => (
                        <li
                          key={`${item}-${index}`}
                          className="flex gap-3 rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-700"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">
                            {index + 1}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                      No se registraron responsabilidades para este puesto.
                    </p>
                  )}
                </section>
              )}
            </form>
          )}
        </main>
      </div>
    </div>
  );
}