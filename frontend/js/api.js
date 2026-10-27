// Small fetch wrapper for the backend API. Cookies (httpOnly JWT) are sent
// automatically via credentials: 'include'.

const API_BASE = '/api';

async function apiRequest(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? Object.assign({ 'Content-Type': 'application/json' }, headers) : headers,
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

// Tell the service worker to forget cached account data (login / logout).
function clearApiCache() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'clear-api-cache' });
    }
  } catch (_) {}
}

// Saves a scan. When the network is down the scan is parked in IndexedDB (the
// service worker normally does this itself; this is the fallback for when no
// worker is in control yet) and synced automatically once back online.
async function saveScanWithOfflineQueue(payload) {
  const body = Object.assign({}, payload);
  if (!body.clientId) body.clientId = typeof OfflineQueue !== 'undefined' ? OfflineQueue.uuid() : String(Date.now() + Math.random());
  if (!body.capturedAt) body.capturedAt = new Date().toISOString();
  const headers = Api.userId ? { 'X-Mien-User': String(Api.userId) } : undefined;
  try {
    return await apiRequest('/scans', { method: 'POST', body, headers });
  } catch (err) {
    const isNetworkError = err && err.status === undefined; // fetch itself failed
    if (!isNetworkError || typeof OfflineQueue === 'undefined') throw err;
    await OfflineQueue.enqueue(body, Api.userId);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.sync) await reg.sync.register(OfflineQueue.TAG);
    } catch (_) {}
    return { queued: true, clientId: body.clientId };
  }
}

const Api = {
  userId: null,
  signup: (payload) => apiRequest('/auth/signup', { method: 'POST', body: payload }).then((r) => { clearApiCache(); return r; }),
  login: (payload) => apiRequest('/auth/login', { method: 'POST', body: payload }).then((r) => { clearApiCache(); return r; }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }).then((r) => { clearApiCache(); return r; }),
  me: () => apiRequest('/auth/me').then((r) => { if (r && r.user) Api.userId = r.user.id; return r; }),
  resetStatus: (email, pin) => apiRequest('/auth/reset-status', { method: 'POST', body: { email, pin } }),
  forgot: (email) => apiRequest('/auth/forgot', { method: 'POST', body: { email } }),
  changePassword: (payload) => apiRequest('/auth/change-password', { method: 'POST', body: payload }),
  saveScan: (payload) => saveScanWithOfflineQueue(payload),
  getScans: () => apiRequest('/scans'),
  deleteScan: (id) => apiRequest(`/scans/${id}`, { method: 'DELETE' }),
  adminAnalytics: () => apiRequest('/admin/analytics'),
  adminStats: () => apiRequest('/admin/stats'),
  adminUsers: () => apiRequest('/admin/users'),
  adminDeleteUser: (id) => apiRequest(`/admin/users/${id}`, { method: 'DELETE' }),
  adminResets: () => apiRequest('/admin/resets'),
  adminResetPassword: (id, password) => apiRequest(`/admin/users/${id}/reset-password`, { method: 'POST', body: { password: password || '' } }),
  adminScans: () => apiRequest('/admin/scans'),
  adminDeleteScan: (id) => apiRequest(`/admin/scans/${id}`, { method: 'DELETE' })
};
