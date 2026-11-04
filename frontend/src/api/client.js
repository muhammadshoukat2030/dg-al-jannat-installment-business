import axios from 'axios';

const defaultBaseURL = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';
const rawBaseURL = import.meta.env.VITE_API_URL || defaultBaseURL;
const baseURL = (typeof rawBaseURL === 'string' ? rawBaseURL : '').trim().replace(/\/+$/, '');

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
