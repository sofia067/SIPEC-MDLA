import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/sidebar';
import UserDropdown from '../components/UserDropdown';
import { apiRequest } from '../services/api';
import { useAuth } from '../auth/AuthContext';

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

const ESTADOS_INACTIVOS = ['inactive', 'inactivo', 'desactivado', 'disabled'];

const isInactiveStatus = (profile) =>
  ESTADOS_INACTIVOS.includes(String(profile?.status ?? '').trim().toLocaleLowerCase());

const esRegistroPrueba = (texto) =>
  /\b(qa|prueba|test|fantasma)\b/i.test(String(texto ?? ''));

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

function ProfileField({ label, value, onChange, rows = 1, required = false, type = 'text', step }) {
  const className =
    'mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900';
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {rows > 1 ? (
        <textarea
          className={className}
          rows={rows}
          value={value}
          onChange={onChange}
          required={required}
        />
      ) : (
        <input
          className={className}
          type={type}
          step={step}
          value={value}
          onChange={onChange}
          required={required}
        />
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
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [form, setForm] = useState(emptyProfile);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState('');
  const [deleting, setDeleting] = useState('');
  const [error, setError] = useState('');

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

  function findDuplicateProfile() {
    const cleanTitle = normalizeText(form.title);
    const cleanDepartment = normalizeText(form.department);
    const cleanCode = normalizeText(form.profileCode);

    return profiles.find((profile) => {
      if (isInactiveStatus(profile)) return false;

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

    const duplicate = findDuplicateProfile();
    if (duplicate) {
      setError(
        `Ya existe un perfil activo registrado con ese puesto en la misma unidad orgánica o con el mismo código («${duplicate.title}» — ${duplicate.department}).`
      );
      return;
    }

    setSaving(true);
    try {
      const parsedSalary =
        form.remuneration === '' || form.remuneration === null || form.remuneration === undefined
          ? null
          : Number(form.remuneration);

      if (parsedSalary !== null && Number.isNaN(parsedSalary)) {
        setError('La remuneración referencial debe ser un número válido.');
        setSaving(false);
        return;
      }

      await apiRequest('/profiles', {
        method: 'POST',
        body: JSON.stringify({
          title: String(form.title).trim(),
          department: String(form.department).trim(),
          level: String(form.level).trim(),
          profileCode: String(form.profileCode).trim(),
          remuneration: parsedSalary,
          education: String(form.education).trim(),
          generalExperience: String(form.generalExperience).trim(),
          specificExperience: String(form.specificExperience).trim(),
          technicalKnowledge: String(form.technicalKnowledge).trim(),
          principalRequirements: String(form.principalRequirements).trim(),
          description: String(form.description).trim(),
          competencies: toLines(form.competencies).map((name) => ({ name, description: '' })),
          functions: toLines(form.functions),
        }),
      });
      await loadProfiles();
      setForm(emptyProfile);
      setShowForm(false);
    } catch (requestError) {
      setError(requestError.message);
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

  const visibleBaseProfiles = profiles.filter(
    (profile) => mostrarInactivos || !isInactiveStatus(profile)
  );

  const areas = [...new Set(visibleBaseProfiles.map((profile) => profile.department).filter(Boolean))];

  const availableDepartments = [
    ...new Set([
      ...lookupData.departments.map((department) => department.name),
      ...profiles
        .filter((profile) => !isInactiveStatus(profile))
        .map((profile) => profile.department),
      ...(form.department ? [form.department] : []),
    ]),
  ]
    .filter((dept) => Boolean(dept) && !esRegistroPrueba(dept))
    .sort((a, b) => a.localeCompare(b, 'es'));

  const availableLevels = [
    ...new Set([
      ...lookupData.catalogData.positionLevels,
      ...profiles.map((profile) => profile.level),
      ...(form.level ? [form.level] : []),
    ]),
  ].filter(Boolean);

  const availableEducations = [
    ...new Set([
      ...lookupData.catalogData.educationLevels,
      ...profiles.map((profile) => profile.education),
      ...(form.education ? [form.education] : []),
    ]),
  ].filter(Boolean);

  const filteredProfiles = visibleBaseProfiles.filter((profile) => {
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
          {error && (
            <div
              role="alert"
              className="rounded border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700"
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
                onClick={() => {
                  setError('');
                  setForm(emptyProfile);
                  setShowForm(true);
                }}
                className="bg-blue-950 hover:bg-blue-900 text-white font-semibold text-sm px-4 py-2.5 rounded-lg"
              >
                + Nuevo perfil
              </button>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="search"
                placeholder="Buscar por puesto, código o requisitos..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full md:w-2/3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={areaFilter}
                onChange={(event) => setAreaFilter(event.target.value)}
                className="w-full md:w-1/3 border border-gray-300 rounded-lg p-2 text-sm"
              >
                <option value="Todas">Todas las unidades orgánicas</option>
                {areas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex w-fit items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(event) => setMostrarInactivos(event.target.checked)}
                className="h-4 w-4 accent-blue-900"
              />
              Mostrar perfiles inactivos / desactivados
            </label>
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
                        : mostrarInactivos
                          ? 'No hay perfiles que coincidan con el filtro.'
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
            <form onSubmit={saveProfile} className="space-y-5">
              <section className="grid gap-4 md:grid-cols-2">
                <ProfileField
                  label="Nombre del puesto"
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
                <ProfileField
                  label="Código del perfil"
                  value={form.profileCode}
                  onChange={(event) => setForm({ ...form, profileCode: event.target.value })}
                />
                <label className="block text-sm font-medium text-gray-700">
                  Unidad orgánica
                  <select
                    required
                    value={form.department}
                    onChange={(event) => setForm({ ...form, department: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="">Selecciona un área</option>
                    {availableDepartments.map((departmentName) => (
                      <option key={departmentName} value={departmentName}>
                        {departmentName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Nivel / Grupo
                  <select
                    required
                    value={form.level}
                    onChange={(event) => setForm({ ...form, level: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="">Selecciona un nivel o grupo</option>
                    {availableLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <ProfileField
                  label="Remuneración referencial (S/)"
                  type="number"
                  step="0.01"
                  value={form.remuneration}
                  onChange={(event) => setForm({ ...form, remuneration: event.target.value })}
                />
                <label className="block text-sm font-medium text-gray-700">
                  Formación académica
                  <select
                    value={form.education}
                    onChange={(event) => setForm({ ...form, education: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
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
                  label="Experiencia general"
                  rows={2}
                  value={form.generalExperience}
                  onChange={(event) => setForm({ ...form, generalExperience: event.target.value })}
                />
                <ProfileField
                  label="Experiencia específica"
                  rows={2}
                  value={form.specificExperience}
                  onChange={(event) => setForm({ ...form, specificExperience: event.target.value })}
                />
              </section>
              <ProfileField
                label="Conocimientos técnicos / certificaciones (uno por línea)"
                rows={4}
                value={form.technicalKnowledge}
                onChange={(event) => setForm({ ...form, technicalKnowledge: event.target.value })}
              />
              <ProfileField
                label="Competencias (una por línea)"
                rows={3}
                value={form.competencies}
                onChange={(event) => setForm({ ...form, competencies: event.target.value })}
              />
              <ProfileField
                label="Funciones principales (una por línea)"
                rows={5}
                value={form.functions}
                onChange={(event) => setForm({ ...form, functions: event.target.value })}
              />
              <ProfileField
                label="Otros requisitos principales"
                rows={3}
                value={form.principalRequirements}
                onChange={(event) =>
                  setForm({ ...form, principalRequirements: event.target.value })
                }
              />
              <ProfileField
                label="Descripción / misión del puesto"
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
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