import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const emptyProfile = {
  title: '',
  department: '',
  level: '',
  profileCode: '',
  remuneration: '',
  education: '',
  generalExperience: '',
  specificExperience: '',
  technicalKnowledge: '',
  principalRequirements: '',
  description: '',
  competencies: '',
  functions: '',
};

const emptyFieldFeedback = {
  title: null,
  profileCode: null,
  department: null,
  level: null,
  remuneration: null,
  generalExperience: null,
  specificExperience: null,
  technicalKnowledge: null,
  competencies: null,
  functions: null,
  principalRequirements: null,
  description: null,
};

const ESTADOS_INACTIVOS = ['inactive', 'inactivo', 'desactivado', 'disabled'];
const PALABRAS_PRUEBA = /\b(qa|prueba|test|fantasma|demo)\b/i;
const PATRON_CODIGO_CONSOLA =
  /(\bconsole\s*\.\s*(log|warn|error|info|debug|table)\b|\.\s*console\s*\(|\b(alert|prompt|confirm)\s*\(|\b(function|const|let|var|return)\b)/i;
const PATRON_TEXTO_BASURA = /(.)\1{2,}|\b[^aeiouáéíóúü\s\d]{6,}\b/i;

const isInactiveStatus = (profile) =>
  ESTADOS_INACTIVOS.includes(String(profile?.status ?? '').trim().toLocaleLowerCase());

const esRegistroPrueba = (profile) => {
  if (!profile) return false;
  if (profile.is_demo === true) return true;

  const camposIdentificacion = [
    profile.profile_code,
    profile.code,
    profile.id,
    profile.department,
  ];

  const camposTextoLibre = [
    profile.title,
    profile.description,
    profile.principal_requirements,
    profile.technical_knowledge,
  ];

  const tienePalabraClave = [...camposIdentificacion, ...camposTextoLibre].some((valor) =>
    PALABRAS_PRUEBA.test(String(valor ?? ''))
  );

  const tieneTextoBasuraOConsola = camposTextoLibre.some((valor) => {
    const texto = String(valor ?? '');
    return PATRON_CODIGO_CONSOLA.test(texto) || PATRON_TEXTO_BASURA.test(texto);
  });

  return tienePalabraClave || tieneTextoBasuraOConsola;
};

const separarPerfiles = (lista = []) => {
  const operativos = [];
  const pruebas = [];

  for (const item of lista) {
    if (isInactiveStatus(item) || esRegistroPrueba(item)) {
      pruebas.push(item);
    } else {
      operativos.push(item);
    }
  }

  return { operativos, pruebas };
};

const normalizeText = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';

const toLines = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
};

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

function ProfileField({
  label,
  helperText,
  feedback,
  value,
  onChange,
  onKeyDown,
  onBeforeInput,
  rows = 1,
  required = false,
  type = 'text',
  inputMode,
  placeholder,
}) {
  const className = getInputClasses(feedback, 'mt-1');

  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {rows > 1 ? (
        <textarea
          className={className}
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
          className={className}
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

export default function PerfilPuesto() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeGestionarPerfiles = ['admin', 'hr_specialist'].includes(user?.role);

  const [profiles, setProfiles] = useState([]);
  const [lookupData, setLookupData] = useState({
    departments: [],
    catalogData: { positionLevels: [], educationLevels: [] },
  });
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyProfile);
  const [fieldFeedback, setFieldFeedback] = useState(emptyFieldFeedback);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState('');
  const [deleting, setDeleting] = useState('');
  const [error, setError] = useState('');

  function abrirNuevoFormulario() {
    setError('');
    setFieldFeedback(emptyFieldFeedback);
    setForm(emptyProfile);
    setShowForm(true);
  }

  async function loadProfiles() {
    setLoading(true);
    try {
      const { profiles: loadedProfiles } = await apiRequest('/profiles');
      setProfiles(Array.isArray(loadedProfiles) ? loadedProfiles : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
    if (puedeGestionarPerfiles) {
      apiRequest('/lookups')
        .then((data) => {
          setLookupData({
            departments: Array.isArray(data?.departments) ? data.departments : [],
            catalogData: {
              positionLevels: Array.isArray(data?.catalogData?.positionLevels)
                ? data.catalogData.positionLevels
                : [],
              educationLevels: Array.isArray(data?.catalogData?.educationLevels)
                ? data.catalogData.educationLevels
                : [],
            },
          });
        })
        .catch((requestError) => setError(requestError.message));
    }
  }, [puedeGestionarPerfiles]);

  function handleSoloLetrasKeyDown(fieldName) {
    return (event) => {
      if (
        /^[0-9]$/.test(event.key) ||
        (event.code?.startsWith('Numpad') && /[0-9]/.test(event.key))
      ) {
        event.preventDefault();
        setFieldFeedback((prev) => ({
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
        setFieldFeedback((prev) => ({
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

      setFieldFeedback((prev) => ({
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

      if (error) setError('');
      setForm((prev) => ({ ...prev, [fieldName]: sanitized }));
    };
  }

  function soloLetrasFieldProps(fieldName, label, extra = {}) {
    return {
      label,
      helperText: 'Solo letras (no se aceptan números).',
      feedback: fieldFeedback[fieldName],
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

    setFieldFeedback((prev) => ({
      ...prev,
      profileCode:
        rawValue !== sanitized
          ? {
              message: 'Solo se permiten letras, números y guiones.',
              severity: 'warning',
            }
          : null,
    }));

    if (error) setError('');
    setForm((prev) => ({ ...prev, profileCode: sanitized }));
  }

  function handleRemunerationChange(event) {
    const rawValue = event.target.value;
    const sanitized = sanitizarRemuneracionInput(rawValue);
    const intentoLetrasOSimbolos = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ-]/.test(rawValue);

    if (sanitized !== '' && Number(sanitized) === 0 && !sanitized.endsWith('.')) {
      const msg = 'Ingresa un monto mayor a cero.';
      setFieldFeedback((prev) => ({
        ...prev,
        remuneration: { message: msg, severity: 'error' },
      }));
      setError(`Remuneración referencial (S/): ${msg}`);
      setForm((prev) => ({ ...prev, remuneration: '' }));
      return;
    }

    setFieldFeedback((prev) => ({
      ...prev,
      remuneration: intentoLetrasOSimbolos
        ? {
            message: 'Solo se aceptan números positivos.',
            severity: 'warning',
          }
        : null,
    }));

    if (error) setError('');
    setForm((prev) => ({ ...prev, remuneration: sanitized }));
  }

  function handleRemunerationKeyDown(event) {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      const msg =
        event.key === '-'
          ? 'No se aceptan montos negativos.'
          : 'Solo se aceptan números positivos.';
      setFieldFeedback((prev) => ({
        ...prev,
        remuneration: { message: msg, severity: 'warning' },
      }));
      event.preventDefault();
    }
  }

  function findDuplicateProfile() {
    const cleanTitle = normalizeText(form.title);
    const cleanDepartment = normalizeText(form.department);
    const cleanCode = normalizeText(form.profileCode);

    return profiles.find((profile) => {
      if (isInactiveStatus(profile) || esRegistroPrueba(profile)) return false;

      const sameTitleAndArea =
        Boolean(cleanTitle) &&
        Boolean(cleanDepartment) &&
        normalizeText(profile.title) === cleanTitle &&
        normalizeText(profile.department) === cleanDepartment;

      const sameCode =
        Boolean(cleanCode) &&
        Boolean(profile.profile_code) &&
        normalizeText(profile.profile_code) === cleanCode;

      return sameTitleAndArea || sameCode;
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    setFieldFeedback(emptyFieldFeedback);

    const cleanTitle = sanitizarSoloLetras(form.title).trim();
    if (!cleanTitle || !/[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]/.test(cleanTitle)) {
      const msg = 'Solo se permiten letras; no puede quedar vacío.';
      setFieldFeedback((prev) => ({
        ...prev,
        title: { message: msg, severity: 'error' },
      }));
      setError(`Nombre del puesto: ${msg}`);
      return;
    }

    if (!String(form.department || '').trim()) {
      const msg = 'Selecciona una unidad orgánica.';
      setFieldFeedback((prev) => ({
        ...prev,
        department: { message: msg, severity: 'error' },
      }));
      setError(`Unidad orgánica: ${msg}`);
      return;
    }

    if (!String(form.level || '').trim()) {
      const msg = 'Selecciona un nivel o grupo.';
      setFieldFeedback((prev) => ({
        ...prev,
        level: { message: msg, severity: 'error' },
      }));
      setError(`Nivel / grupo: ${msg}`);
      return;
    }

    const camposLetras = [
      { key: 'generalExperience', label: 'Experiencia general' },
      { key: 'specificExperience', label: 'Experiencia específica' },
      { key: 'technicalKnowledge', label: 'Conocimientos técnicos' },
      { key: 'competencies', label: 'Competencias' },
      { key: 'functions', label: 'Funciones principales' },
      { key: 'principalRequirements', label: 'Otros requisitos' },
      { key: 'description', label: 'Descripción / misión del puesto' },
    ];

    for (const campo of camposLetras) {
      if (/[0-9]/.test(String(form[campo.key] || ''))) {
        const msg = 'Solo se permiten letras; no se aceptan números.';
        setFieldFeedback((prev) => ({
          ...prev,
          [campo.key]: { message: msg, severity: 'error' },
        }));
        setError(`${campo.label}: ${msg}`);
        return;
      }
    }

    const duplicate = findDuplicateProfile();
    if (duplicate) {
      const msg = `Ya existe un perfil activo con ese puesto en «${duplicate.department}» o con ese código («${duplicate.title}»).`;
      setFieldFeedback((prev) => ({
        ...prev,
        title: { message: msg, severity: 'error' },
      }));
      setError(`Nombre del puesto: ${msg}`);
      return;
    }

    const rangoActual = obtenerRangoRemuneracion(form.level);
    const nivelTexto = String(form.level || '').trim();
    let parsedSalary = null;

    if (form.remuneration !== '' && form.remuneration !== null && form.remuneration !== undefined) {
      parsedSalary = Number(form.remuneration);
      if (Number.isNaN(parsedSalary) || !Number.isFinite(parsedSalary)) {
        const msg = 'Solo se aceptan números válidos.';
        setFieldFeedback((prev) => ({
          ...prev,
          remuneration: { message: msg, severity: 'error' },
        }));
        setError(`Remuneración referencial (S/): ${msg}`);
        return;
      }
      if (parsedSalary <= 0) {
        const msg = 'Ingresa un monto mayor a cero.';
        setFieldFeedback((prev) => ({
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
        setFieldFeedback((prev) => ({
          ...prev,
          remuneration: { message: msg, severity: 'error' },
        }));
        setError(`Remuneración referencial (S/): ${msg}`);
        return;
      }
    }

    setSaving(true);
    try {
      await apiRequest('/profiles', {
        method: 'POST',
        body: JSON.stringify({
          title: cleanTitle,
          department: String(form.department).trim(),
          level: String(form.level).trim(),
          profileCode: sanitizarCodigoPerfil(form.profileCode).trim(),
          remuneration: parsedSalary,
          education: String(form.education).trim(),
          generalExperience: sanitizarSoloLetras(form.generalExperience).trim(),
          specificExperience: sanitizarSoloLetras(form.specificExperience).trim(),
          technicalKnowledge: sanitizarSoloLetras(form.technicalKnowledge).trim(),
          principalRequirements: sanitizarSoloLetras(form.principalRequirements).trim(),
          description: sanitizarSoloLetras(form.description).trim(),
          competencies: toLines(sanitizarSoloLetras(form.competencies)).map((name) => ({
            name,
            description: '',
          })),
          functions: toLines(sanitizarSoloLetras(form.functions)),
        }),
      });
      await loadProfiles();
      setForm(emptyProfile);
      setFieldFeedback(emptyFieldFeedback);
      setShowForm(false);
    } catch (requestError) {
      setError(`No se pudo guardar el perfil: ${requestError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateProfile(profile) {
    if (
      !window.confirm(
        `¿Desactivar el perfil «${profile.title}»? Se ocultará de la vista activa y se conservará como inactivo.`
      )
    ) {
      return;
    }
    setDeactivating(profile.id);
    setError('');
    try {
      await apiRequest(`/profiles/${profile.id}/deactivate`, { method: 'PATCH' });
      await loadProfiles();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeactivating('');
    }
  }

  async function deleteProfile(profile) {
    if (
      !window.confirm(
        `¿Eliminar permanentemente el perfil «${profile.title}»? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setDeleting(profile.id);
    setError('');
    try {
      await apiRequest(`/profiles/${profile.id}`, { method: 'DELETE' });
      await loadProfiles();
    } catch (requestError) {
      setError(
        `${requestError.message} (Si el perfil ya está asociado a convocatorias o postulaciones, usa «Desactivar» para retirarlo del flujo activo.)`
      );
    } finally {
      setDeleting('');
    }
  }

  const { operativos: perfilesOperativos } = separarPerfiles(profiles);

  const areas = [...new Set(perfilesOperativos.map((profile) => profile.department).filter(Boolean))];

  const availableDepartments = [
    ...new Set([
      ...lookupData.departments.map((department) => department.name),
      ...perfilesOperativos.map((profile) => profile.department),
      ...(form.department ? [form.department] : []),
    ]),
  ]
    .filter((dept) => Boolean(dept) && !PALABRAS_PRUEBA.test(String(dept)))
    .sort((a, b) => a.localeCompare(b, 'es'));

  const availableLevels = [
    ...new Set([
      ...lookupData.catalogData.positionLevels,
      ...perfilesOperativos.map((profile) => profile.level),
      ...(form.level ? [form.level] : []),
    ]),
  ].filter(Boolean);

  const availableEducations = [
    ...new Set([
      ...lookupData.catalogData.educationLevels,
      ...perfilesOperativos.map((profile) => profile.education),
      ...(form.education ? [form.education] : []),
    ]),
  ].filter(Boolean);

  const filteredProfiles = perfilesOperativos.filter((profile) => {
    const areaMatches = areaFilter === 'Todas' || profile.department === areaFilter;
    const query = search.toLocaleLowerCase();
    const textMatches = [
      profile.title,
      profile.profile_code,
      profile.department,
      profile.principal_requirements,
      profile.education,
      profile.technical_knowledge,
    ].some((value) => (value || '').toLocaleLowerCase().includes(query));
    return areaMatches && textMatches;
  });

  const rangoFormulario = obtenerRangoRemuneracion(form.level);
  const textoAyudaRemuneracion = String(form.level || '').trim()
    ? `Rango: ${formatearMoneda(rangoFormulario.min)} a ${formatearMoneda(rangoFormulario.max)} (${String(form.level).trim()}). Ingresa un monto mayor a cero.`
    : `Rango: ${formatearMoneda(rangoFormulario.min)} a ${formatearMoneda(rangoFormulario.max)}. Ingresa un monto mayor a cero.`;

  return (
    <div className="app-shell flex h-dvh flex-col bg-gray-100 font-sans text-gray-800 md:flex-row">
      <Sidebar />
      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-y-auto">
        <header className="bg-white border-b px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-blue-950">SIPEC-MLA</h1>
            <span className="text-xs bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded-full">
              Perfiles de Puesto
            </span>
          </div>
          <UserDropdown />
        </header>

        <main className="p-8 space-y-6">
          {error && !showForm && (
            <div
              role="alert"
              className="rounded-lg border border-red-200/80 bg-red-50/70 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">Perfiles de Puesto</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-full shadow-sm">
                  <span>⚡</span>
                  <span>Modo Demostración</span>
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Gestión de requisitos, competencias y funciones por unidad orgánica
              </p>
            </div>
            {puedeGestionarPerfiles && (
              <button
                onClick={abrirNuevoFormulario}
                className="bg-blue-950 hover:bg-blue-900 text-white font-semibold text-sm px-4 py-2.5 rounded-lg"
              >
                + Nuevo perfil
              </button>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
            <input
              type="search"
              placeholder="Buscar por puesto, código o requisitos..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full md:w-2/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900/20"
            />
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              className="w-full md:w-1/3 border border-gray-300 rounded-lg p-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900/20"
            >
              <option value="Todas">Todas las unidades orgánicas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-600 font-semibold text-xs uppercase">
                  <th className="py-3 px-4">Código / Puesto</th>
                  <th className="py-3 px-4">Unidad orgánica</th>
                  <th className="py-3 px-4">Nivel</th>
                  <th className="py-3 px-4">Remuneración</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-center">
                    Detalle{puedeGestionarPerfiles ? ' / Acciones' : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProfiles.map((profile) => (
                  <tr key={profile.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-semibold">{profile.title}</div>
                      <div className="text-xs text-gray-500">
                        {profile.profile_code || 'Sin código'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{profile.department}</td>
                    <td className="py-3 px-4">{profile.level}</td>
                    <td className="py-3 px-4">
                      {profile.remuneration == null
                        ? '—'
                        : `S/ ${Number(profile.remuneration).toLocaleString('es-PE', {
                            minimumFractionDigits: 2,
                          })}`}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium px-2 py-1 rounded-full text-xs ${
                          profile.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {profile.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={() => navigate(`/perfil-puesto/detalle/${profile.id}`)}
                          className="text-blue-900 hover:underline font-semibold"
                        >
                          Ver ficha
                        </button>
                        {puedeGestionarPerfiles && profile.status === 'active' && (
                          <button
                            onClick={() => deactivateProfile(profile)}
                            disabled={deactivating === profile.id || deleting === profile.id}
                            className="text-amber-700 hover:underline disabled:text-gray-400"
                          >
                            {deactivating === profile.id ? 'Desactivando...' : 'Desactivar'}
                          </button>
                        )}
                        {puedeGestionarPerfiles && (
                          <button
                            onClick={() => deleteProfile(profile)}
                            disabled={deleting === profile.id || deactivating === profile.id}
                            className="text-red-700 hover:underline font-semibold disabled:text-gray-400"
                          >
                            {deleting === profile.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredProfiles.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      {error
                        ? 'No se pudieron cargar los perfiles.'
                        : 'No hay perfiles activos registrados.'}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-gray-500">
                      Cargando perfiles...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {puedeGestionarPerfiles && showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-form-title"
            className="mx-auto my-8 w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between border-b pb-3">
              <h3 id="profile-form-title" className="text-lg font-bold">
                Registrar ficha de puesto
              </h3>
              <button
                onClick={() => setShowForm(false)}
                aria-label="Cerrar"
                className="text-xl text-gray-500"
              >
                ×
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200/80 bg-red-50/70 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <form onSubmit={saveProfile} className="space-y-5">
              <section className="grid gap-4 md:grid-cols-2">
                <ProfileField {...soloLetrasFieldProps('title', 'Nombre del puesto', { required: true })} />
                <ProfileField
                  label="Código del perfil"
                  helperText="Letras, números y guiones (ej. PRF-TIC-001)."
                  feedback={fieldFeedback.profileCode}
                  value={form.profileCode}
                  onChange={handleCodeChange}
                />
                <label className="block text-sm font-medium text-gray-700">
                  Unidad orgánica
                  <select
                    required
                    value={form.department}
                    onChange={(event) => {
                      setFieldFeedback((prev) => ({ ...prev, department: null }));
                      if (error) setError('');
                      setForm({ ...form, department: event.target.value });
                    }}
                    className={getInputClasses(fieldFeedback.department, 'mt-1')}
                  >
                    <option value="">Selecciona un área</option>
                    {availableDepartments.map((departmentName) => (
                      <option key={departmentName} value={departmentName}>
                        {departmentName}
                      </option>
                    ))}
                  </select>
                  {fieldFeedback.department?.message && (
                    <span
                      role="alert"
                      className={getFeedbackBoxClasses(fieldFeedback.department.severity)}
                    >
                      {fieldFeedback.department.message}
                    </span>
                  )}
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Nivel / Grupo
                  <select
                    required
                    value={form.level}
                    onChange={(event) => {
                      setFieldFeedback((prev) => ({ ...prev, level: null, remuneration: null }));
                      if (error) setError('');
                      setForm({ ...form, level: event.target.value });
                    }}
                    className={getInputClasses(fieldFeedback.level, 'mt-1')}
                  >
                    <option value="">Selecciona un nivel o grupo</option>
                    {availableLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  {fieldFeedback.level?.message && (
                    <span
                      role="alert"
                      className={getFeedbackBoxClasses(fieldFeedback.level.severity)}
                    >
                      {fieldFeedback.level.message}
                    </span>
                  )}
                </label>
                <ProfileField
                  label="Remuneración referencial (S/)"
                  helperText={textoAyudaRemuneracion}
                  feedback={fieldFeedback.remuneration}
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej. 2500.00"
                  value={form.remuneration}
                  onChange={handleRemunerationChange}
                  onKeyDown={handleRemunerationKeyDown}
                />
                <label className="block text-sm font-medium text-gray-700">
                  Formación académica
                  <select
                    value={form.education}
                    onChange={(event) => setForm({ ...form, education: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-800 transition-colors focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900/20"
                  >
                    <option value="">Selecciona una formación</option>
                    {availableEducations.map((education) => (
                      <option key={education} value={education}>
                        {education}
                      </option>
                    ))}
                  </select>
                </label>
                <ProfileField
                  {...soloLetrasFieldProps('generalExperience', 'Experiencia general', { rows: 2 })}
                />
                <ProfileField
                  {...soloLetrasFieldProps('specificExperience', 'Experiencia específica', { rows: 2 })}
                />
              </section>
              <ProfileField
                {...soloLetrasFieldProps(
                  'technicalKnowledge',
                  'Conocimientos técnicos / certificaciones (uno por línea)',
                  { rows: 4 }
                )}
              />
              <ProfileField
                {...soloLetrasFieldProps('competencies', 'Competencias (una por línea)', {
                  rows: 3,
                })}
              />
              <ProfileField
                {...soloLetrasFieldProps('functions', 'Funciones principales (una por línea)', {
                  rows: 5,
                })}
              />
              <ProfileField
                {...soloLetrasFieldProps('principalRequirements', 'Otros requisitos principales', {
                  rows: 3,
                })}
              />
              <ProfileField
                {...soloLetrasFieldProps('description', 'Descripción / misión del puesto', {
                  rows: 3,
                })}
              />
              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                >
                  {saving ? 'Guardando...' : 'Guardar ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}