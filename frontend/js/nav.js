// Populates the shared nav's auth-dependent actions on every page, and adds
// a small "history status" count badge next to the History nav link.
(async function initNav() {
  const actions = document.getElementById('nav-actions');
  if (!actions) return;

  try {
    const { user } = await Api.me();
    actions.innerHTML = `
      <span class="muted" style="font-size:14px;">Hi, ${user.name.split(' ')[0]}</span>
      ${user.role === 'admin' ? '<a class="btn btn-ghost" href="/admin.html">Admin</a>' : ''}
      <a class="btn btn-ghost" href="/dashboard.html">Dashboard</a>
      <button class="btn btn-primary" id="nav-logout">Log out</button>
    `;
    document.getElementById('nav-logout').addEventListener('click', async () => {
      await Api.logout();
      window.location.href = '/index.html';
    });

    // Best-effort — if this fails (e.g. offline), the nav just shows no badge.
    try {
      const { scans } = await Api.getScans();
      const historyLink = document.querySelector('.nav-links a[href="/history.html"]');
      if (historyLink && scans.length) {
        historyLink.innerHTML = `History<span class="nav-count-badge">${scans.length}</span>`;
      }
    } catch (_) {
      /* no badge, no problem */
    }
  } catch (_) {
    actions.innerHTML = `
      <a class="btn btn-ghost" href="/login.html">Log in</a>
      <a class="btn btn-primary" href="/signup.html">Get started</a>
    `;
  }
})();
