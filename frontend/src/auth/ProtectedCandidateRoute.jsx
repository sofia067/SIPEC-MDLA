import { Navigate } from 'react-router-dom';
import { ROLES } from '../config/roles';
import { useCandidateAuth } from './CandidateAuthContext';

export default function ProtectedCandidateRoute({ children }) {
  const { user } = useCandidateAuth();
  return user?.role === ROLES.CANDIDATO ? children : <Navigate to="/postulante/login" replace />;
}
