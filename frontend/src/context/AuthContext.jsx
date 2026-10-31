import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';
import { getPendingOperations } from '../offline/db';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const stored = localStorage.getItem('ims_admin');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ims_token');
    if (!token) {
      setLoading(false);
      return;
    }
    client
      .get('/auth/me')
      .then((res) => setAdmin(res.data.admin))
      .catch(() => {
        localStorage.removeItem('ims_token');
        localStorage.removeItem('ims_admin');
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await client.post('/auth/login', { email, password });
    localStorage.setItem('ims_token', res.data.token);
    localStorage.setItem('ims_admin', JSON.stringify(res.data.admin));
    setAdmin(res.data.admin);
    return res.data;
  }

  async function logout() {
    try {
      const pending = await getPendingOperations();
      if (pending && pending.length > 0) {
        console.warn(`Logout notice: ${pending.length} pending offline operations remain safely queued in IndexedDB.`);
      }
    } catch {
      // Best effort
    }
    localStorage.removeItem('ims_token');
    localStorage.removeItem('ims_admin');
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout, isAuthenticated: !!admin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
