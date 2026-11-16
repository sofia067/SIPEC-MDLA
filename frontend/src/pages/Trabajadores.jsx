import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/sidebar';
import UserDropdown from '../components/UserDropdown';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../services/api';

const emptyForm = {
  employeeNumber: '',
  documentNumber: '',
  fullName: '',
  email: '',
  phone: '',
  department: '',
  positionId: '',
  status: 'active',
};

const inputClassName = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900';

export default function Trabajadores() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageWorkers = ['admin', 'hr_specialist'].includes(user?.role);
  const [busqueda, setBusqueda] = useState('');
  const [trabajadores, setTrabajadores] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [workerBeingEdited, setWorkerBeingEdited] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const loadWorkers = async () => {
    const { workers } = await apiRequest('/workers');
    setTrabajadores(workers);
  };

  useEffect(() => {
    Promise.all([
      apiRequest('/workers'),
      apiRequest('/lookups'),
    ])
      .then(([{ workers }, lookups]) => {
        setTrabajadores(workers);
        setDepartments(lookups.departments);
        setProfiles(lookups.profiles);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setCargando(false));
  }, []);

  const perfilesDelArea = useMemo(
    () => profiles.filter((profile) => profile.department === form.department),
    [profiles, form.department],
  );

  const filtrados = trabajadores.filter((worker) => {
    const query = busqueda.trim().toLocaleLowerCase();
    return !query
      || worker.full_name.toLocaleLowerCase().includes(query)
      || worker.document_number.includes(busqueda.trim())
      || worker.employee_number.toLocaleLowerCase().includes(query)
      || (worker.position ?? '').toLocaleLowerCase().includes(query)
      || worker.department.toLocaleLowerCase().includes(query);
  });

  const openNewWorkerForm = () => {
    setWorkerBeingEdited(null);
    setForm({ ...emptyForm, department: departments[0]?.name ?? '' });
    setShowForm(true);
    setError('');
  };

  const openEditWorkerForm = (worker) => {
    setWorkerBeingEdited(worker);
    setForm({
      employeeNumber: worker.employee_number,
      documentNumber: worker.document_number,
      fullName: worker.full_name,
      email: worker.email ?? '',
      phone: worker.phone ?? '',
      department: worker.department,
      positionId: worker.position_id ?? '',
      status: worker.status,
    });
    setShowForm(true);
    setError('');
  };

  const updateFormField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'department' ? { positionId: '' } : {}),
    }));
  };

  const saveWorker = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await apiRequest(workerBeingEdited ? `/workers/${workerBeingEdited.id}` : '/workers', {
        method: workerBeingEdited ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      });
      await loadWorkers();
      setShowForm(false);
      setWorkerBeingEdited(null);
      setForm(emptyForm);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGuardando(false);
    }
  };

  const deactivateWorker = async (worker) => {
    if (!window.confirm(`¿Desactivar a ${worker.full_name}? El registro se conservará en el padrón.`)) return;
    setError('');
    try {
      await apiRequest(`/workers/${worker.id}`, { method: 'DELETE' });
      await loadWorkers();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="app-shell flex h-dvh flex-col bg-gray-100 font-sans text-gray-800 md:flex-row">
      <Sidebar />

      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-y-auto">
        <header className="bg-white border-b px-4 py-3 flex justify-between items-center gap-3 sm:px-8">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-blue-950">SIPEC-MLA</h1>
            <span className="text-xs bg-blue-100 text-blue-800 font-medium px-2.5 py-0.5 rounded-full">
              Padrón General de Personal
            </span>
          </div>
          <UserDropdown />
        </header>

        <main className="p-4 space-y-6 sm:p-8">
          {error && (
            <div role="alert" className="rounded border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Directorio de Trabajadores</h2>
              <p className="text-xs text-gray-500">Registro unificado del personal de la Municipalidad Distrital de Los Aquijes</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                placeholder="Buscar por código, DNI, nombre o puesto..."
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                className="w-full rounded-lg border bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-900 sm:w-72"
              />
              {canManageWorkers && (
                <button
                  type="button"
                  onClick={openNewWorkerForm}
                  className="rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900"
                >
                  + Ingresar trabajador
                </button>
              )}
            </div>
          </div>

          {showForm && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="worker-form-title">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 id="worker-form-title" className="text-lg font-bold text-gray-900">
                  {workerBeingEdited ? 'Editar trabajador' : 'Registrar trabajador'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded px-3 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                >
                  Cancelar
                </button>
              </div>

              <form onSubmit={saveWorker} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-semibold text-gray-700">
                  Código de trabajador
                  <input name="employeeNumber" required maxLength={32} value={form.employeeNumber} onChange={updateFormField} className={`${inputClassName} mt-1`} />
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  DNI o documento
                  <input name="documentNumber" required maxLength={24} value={form.documentNumber} onChange={updateFormField} className={`${inputClassName} mt-1`} />
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  Nombres y apellidos
                  <input name="fullName" required maxLength={160} value={form.fullName} onChange={updateFormField} className={`${inputClassName} mt-1`} />
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  Correo electrónico
                  <input name="email" type="email" maxLength={254} value={form.email} onChange={updateFormField} className={`${inputClassName} mt-1`} />
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  Teléfono
                  <input name="phone" type="tel" maxLength={40} value={form.phone} onChange={updateFormField} className={`${inputClassName} mt-1`} />
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  Área / unidad orgánica
                  <select name="department" required value={form.department} onChange={updateFormField} className={`${inputClassName} mt-1`}>
                    <option value="">Selecciona un área</option>
                    {departments.map((department) => (
                      <option key={department.id ?? department.name} value={department.name}>{department.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-gray-700">
                  Puesto
                  <select name="positionId" value={form.positionId} onChange={updateFormField} className={`${inputClassName} mt-1`}>
                    <option value="">Sin puesto asignado</option>
                    {perfilesDelArea.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.title}</option>
                    ))}
                  </select>
                </label>
                {workerBeingEdited && (
                  <label className="text-sm font-semibold text-gray-700">
                    Estado
                    <select name="status" value={form.status} onChange={updateFormField} className={`${inputClassName} mt-1`}>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </label>
                )}
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                  <button type="submit" disabled={guardando} className="rounded-lg bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-wait disabled:bg-gray-400">
                    {guardando ? 'Guardando...' : workerBeingEdited ? 'Guardar cambios' : 'Guardar trabajador'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b text-gray-400">
                  <th className="pb-3 font-medium">Código</th>
                  <th className="pb-3 font-medium">DNI</th>
                  <th className="pb-3 font-medium">Nombres y Apellidos</th>
                  <th className="pb-3 font-medium">Gerencia / Unidad</th>
                  <th className="pb-3 font-medium">Puesto Actual</th>
                  <th className="pb-3 font-medium">Condición</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((worker) => (
                  <tr key={worker.id} className="transition-colors hover:bg-gray-50">
                    <td className="py-3 font-bold text-blue-950">{worker.employee_number}</td>
                    <td className="py-3 font-mono text-gray-600">{worker.document_number}</td>
                    <td className="py-3 font-semibold text-gray-900">{worker.full_name}</td>
                    <td className="py-3 text-gray-600">{worker.department}</td>
                    <td className="py-3 font-medium text-gray-800">{worker.position || 'Sin puesto asignado'}</td>
                    <td className="py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                        {worker.appointment_resolution || 'No especificada'}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        worker.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {worker.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/trabajadores/expediente?workerId=${worker.id}`)}
                          className="rounded-lg bg-blue-950 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-900"
                        >
                          Ver expediente
                        </button>
                        {canManageWorkers && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditWorkerForm(worker)}
                              className="rounded-lg border border-blue-200 px-3 py-1.5 text-[11px] font-semibold text-blue-900 hover:bg-blue-50"
                            >
                              Editar
                            </button>
                            {worker.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => deactivateWorker(worker)}
                                className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                              >
                                Desactivar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!cargando && filtrados.length === 0 && (
                  <tr><td colSpan="8" className="py-6 text-center text-gray-500">
                    {error ? 'No se pudieron cargar los trabajadores.' : 'No hay trabajadores registrados.'}
                  </td></tr>
                )}
                {cargando && <tr><td colSpan="8" className="py-6 text-center text-gray-500">Cargando trabajadores...</td></tr>}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
