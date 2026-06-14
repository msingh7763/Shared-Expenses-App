import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// ─── Groups ──────────────────────────────────────────────────────────────────
export const groupsApi = {
  list: () => api.get('/groups'),
  get: (id) => api.get(`/groups/${id}`),
  create: (data) => api.post('/groups', data),
  update: (id, data) => api.patch(`/groups/${id}`, data),
  delete: (id) => api.delete(`/groups/${id}`),
  addMember: (groupId, data) => api.post(`/groups/${groupId}/members`, data),
  updateMember: (groupId, userId, data) => api.patch(`/groups/${groupId}/members/${userId}`, data),
  removeMember: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`),
  memberHistory: (groupId) => api.get(`/groups/${groupId}/members/history`),
};

// ─── Expenses ────────────────────────────────────────────────────────────────
export const expensesApi = {
  list: (groupId, params) => api.get(`/groups/${groupId}/expenses`, { params }),
  get: (id) => api.get(`/expenses/${id}`),
  create: (groupId, data) => api.post(`/groups/${groupId}/expenses`, data),
  update: (id, data) => api.patch(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// ─── Balances ────────────────────────────────────────────────────────────────
export const balancesApi = {
  group: (groupId) => api.get(`/groups/${groupId}/balances`),
  me: () => api.get('/users/me/balances'),
};

// ─── Settlements ─────────────────────────────────────────────────────────────
export const settlementsApi = {
  list: (groupId) => api.get(`/groups/${groupId}/settlements`),
  create: (groupId, data) => api.post(`/groups/${groupId}/settlements`, data),
  delete: (id) => api.delete(`/settlements/${id}`),
};

// ─── Import ──────────────────────────────────────────────────────────────────
export const importApi = {
  upload: (groupId, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/import/upload?groupId=${groupId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getJob: (jobId) => api.get(`/import/${jobId}`),
  resolveAnomaly: (jobId, anomalyId, data) => api.patch(`/import/${jobId}/anomalies/${anomalyId}`, data),
  bulkResolve: (jobId, data) => api.post(`/import/${jobId}/anomalies/bulk-resolve`, data),
  apply: (jobId) => api.post(`/import/${jobId}/apply`),
  report: (jobId) => api.get(`/import/${jobId}/report`),
};

export default api;
