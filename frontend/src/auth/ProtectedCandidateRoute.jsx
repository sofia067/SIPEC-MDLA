import { Navigate } from 'react-router-dom';
import { ROLES } from '../config/roles';
import { useCandidateAuth } from './CandidateAuthContext';

export default function ProtectedCandidateRoute({ children }) {
  const { user, loading, authError, refreshSession } = useCandidateAuth();
  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm text-slate-600">Verificando sesión…</main>;
  }
  if (authError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center">
        <p role="alert" className="text-sm text-red-700">{authError}</p>
        <button type="button" onClick={refreshSession} className="rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white">
          Reintentar
        </button>
      </main>
    );
  }
  return user?.role === ROLES.CANDIDATO ? children : <Navigate to="/postulante/login" replace />;
}
