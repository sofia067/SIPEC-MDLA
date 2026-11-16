import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../auth/AuthContext';

export default function NotificationBell() {
  const [pendientes, setPendientes] = useState(null);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    apiRequest('/requests')
      .then((result) => {
        const total = result.requests.filter((request) => ['pending', 'in_review'].includes(request.status)).length;
        setPendientes(total);
      })
      .catch((requestError) => setError(requestError.message));
  }, [user?.role]);

  return (
    <button
      type="button"
      aria-label={`Ir a solicitudes pendientes${pendientes === null ? '' : `, ${pendientes} pendientes`}`}
      title={error || 'Ver solicitudes pendientes'}
      onClick={() => navigate('/solicitudes-cobertura')}
      className="relative rounded-lg bg-amber-50 p-2 text-amber-500 transition-colors hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
    >
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4" />
      </svg>
      {pendientes > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
          {pendientes > 99 ? '99+' : pendientes}
        </span>
      )}
    </button>
  );
}
