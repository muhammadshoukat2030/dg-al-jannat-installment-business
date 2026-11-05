import axios from 'axios';

// In production, strictly disallow localhost API URLs.
// Uses explicitly configured production VITE_API_URL or defaults to the deployed production backend.
const getBaseURL = () => {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (import.meta.env.PROD) {
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl.replace(/\/+$/, '');
    }
    return 'https://dg-al-jannat-installment-business.vercel.app/api';
  }
  return envUrl || 'http://localhost:5000/api';
};

const baseURL = getBaseURL();

const client = axios.create({
  baseURL,
  timeout: 15000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ims_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ims_token');
      localStorage.removeItem('ims_admin');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default client;
