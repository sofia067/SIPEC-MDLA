import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ROLES } from '../config/roles';
import { apiRequest } from '../services/api';

const CandidateAuthContext = createContext(null);

export function CandidateAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setAuthError('');
    try {
      const { candidate } = await apiRequest('/candidate-auth/me');
      setUser({ ...candidate, role: ROLES.CANDIDATO });
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
      } else {
        setAuthError(error.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const value = useMemo(() => ({
    user,
    loading,
    authError,
    refreshSession,
    async login(applicationCode, password) {
      const { candidate } = await apiRequest('/candidate-auth/login', {
        method: 'POST',
        body: JSON.stringify({ applicationCode, password }),
      });
      setUser({ ...candidate, role: ROLES.CANDIDATO });
      setAuthError('');
    },
    async logout() {
      await apiRequest('/candidate-auth/logout', { method: 'POST' });
      setUser(null);
    },
  }), [user, loading, authError, refreshSession]);

  return <CandidateAuthContext.Provider value={value}>{children}</CandidateAuthContext.Provider>;
}

export function useCandidateAuth() {
  const context = useContext(CandidateAuthContext);
  if (!context) throw new Error('useCandidateAuth debe usarse dentro de CandidateAuthProvider.');
  return context;
}
