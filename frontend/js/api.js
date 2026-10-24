// Small fetch wrapper for the backend API. Cookies (httpOnly JWT) are sent
// automatically via credentials: 'include'.

const API_BASE = '/api';

async function apiRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // no body
  }

  if (!res.ok) {
    const message = (data && data.error) || 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return data;
}

const Api = {
  signup: (payload) => apiRequest('/auth/signup', { method: 'POST', body: payload }),
  login: (payload) => apiRequest('/auth/login', { method: 'POST', body: payload }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/auth/me'),
  forgot: (email) => apiRequest('/auth/forgot', { method: 'POST', body: { email } }),
  changePassword: (payload) => apiRequest('/auth/change-password', { method: 'POST', body: payload }),
  saveScan: (payload) => apiRequest('/scans', { method: 'POST', body: payload }),
  getScans: () => apiRequest('/scans'),
  deleteScan: (id) => apiRequest(`/scans/${id}`, { method: 'DELETE' }),
  adminStats: () => apiRequest('/admin/stats'),
  adminUsers: () => apiRequest('/admin/users'),
  adminDeleteUser: (id) => apiRequest(`/admin/users/${id}`, { method: 'DELETE' }),
  adminResets: () => apiRequest('/admin/resets'),
  adminResetPassword: (id) => apiRequest(`/admin/users/${id}/reset-password`, { method: 'POST' }),
  adminScans: () => apiRequest('/admin/scans'),
  adminDeleteScan: (id) => apiRequest(`/admin/scans/${id}`, { method: 'DELETE' })
};
