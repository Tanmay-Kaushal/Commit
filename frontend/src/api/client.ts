import axios from 'axios';

// In production this is built and served by the same Express process as
// the API (see backend/src/index.js), so requests can just go to the
// current origin — no VITE_API_URL needed. In dev, `vite` and the backend
// run as two separate processes on different ports, so default to
// localhost:4000 unless overridden.
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');

const client = axios.create({ baseURL: `${API_URL}/api` });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
export { API_URL };
