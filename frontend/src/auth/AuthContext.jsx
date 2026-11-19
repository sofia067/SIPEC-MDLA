import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    apiRequest('/auth/me')
      .then((data) => {
        setUser(data?.user ?? null);
      })
      .catch((error) => {
        if (error.status === 401) {
          setUser(null);
          return;
        }
        setConnectionError(error.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    connectionError,
    async login(credentials) {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      const loggedUser = result?.user ?? null;
      setUser(loggedUser);
      setConnectionError('');
      return loggedUser;
    },
    async logout() {
      await apiRequest('/auth/logout', { method: 'POST' });
      setUser(null);
    },
  }), [user, loading, connectionError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}