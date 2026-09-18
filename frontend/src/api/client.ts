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

// A 401 means the stored token is missing, expired, or was signed under a
// secret the server no longer recognizes (e.g. after a redeploy). Without
// this, every subsequent request keeps silently failing while the UI still
// thinks it's logged in — pages get stuck on "Loading..." forever with no
// indication why. Clear the stale session and send the user back to log in
// instead of leaving the app hanging.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
export { API_URL };
