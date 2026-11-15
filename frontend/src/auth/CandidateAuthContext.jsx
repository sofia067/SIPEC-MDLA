import { createContext, useContext, useMemo, useState } from 'react';
import { ROLES } from '../config/roles';

const SESSION_KEY = 'sipec_candidate_demo_session';
const ACCOUNTS_KEY = 'sipec_candidate_demo_accounts';
const CandidateAuthContext = createContext(null);

function readAccounts() {
  const savedAccounts = localStorage.getItem(ACCOUNTS_KEY);
  if (!savedAccounts) return [];

  try {
    const accounts = JSON.parse(savedAccounts);
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    localStorage.removeItem(ACCOUNTS_KEY);
    return [];
  }
}

function readSession() {
  const savedSession = sessionStorage.getItem(SESSION_KEY);
  if (!savedSession) return null;

  try {
    const user = JSON.parse(savedSession);
    if (user.role === ROLES.CANDIDATO && user.email && user.name && user.phone && user.documentNumber) return user;
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: encoder.encode(salt),
    iterations: 100000,
    hash: 'SHA-256',
  }, key, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openSession(profile) {
  const candidate = { ...profile, role: ROLES.CANDIDATO };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(candidate));
  return candidate;
}

export function CandidateAuthProvider({ children }) {
  const [user, setUser] = useState(readSession);
  const value = useMemo(() => ({
    user,
    async register({ name, email, phone, documentNumber, password }) {
      const accounts = readAccounts();
      const normalizedEmail = email.trim().toLowerCase();
      if (accounts.some((account) => account.email === normalizedEmail)) {
        throw new Error('Ya existe una cuenta de demostración con ese correo.');
      }

      const salt = crypto.randomUUID();
      const passwordHash = await hashPassword(password, salt);
      const profile = {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        documentNumber: documentNumber.trim(),
      };
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, { ...profile, salt, passwordHash }]));
      setUser(openSession(profile));
    },
    async login(email, password) {
      const normalizedEmail = email.trim().toLowerCase();
      const account = readAccounts().find((savedAccount) => savedAccount.email === normalizedEmail);
      if (!account) throw new Error('No encontramos una cuenta con ese correo. Crea una cuenta para continuar.');

      const passwordHash = await hashPassword(password, account.salt);
      if (passwordHash !== account.passwordHash) throw new Error('La contraseña no es correcta.');

      setUser(openSession({
        name: account.name,
        email: account.email,
        phone: account.phone,
        documentNumber: account.documentNumber,
      }));
    },
    logout() {
      sessionStorage.removeItem(SESSION_KEY);
      setUser(null);
    },
  }), [user]);

  return <CandidateAuthContext.Provider value={value}>{children}</CandidateAuthContext.Provider>;
}

export function useCandidateAuth() {
  const context = useContext(CandidateAuthContext);
  if (!context) throw new Error('useCandidateAuth debe usarse dentro de CandidateAuthProvider.');
  return context;
}
