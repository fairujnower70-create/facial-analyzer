// Populates the shared nav's auth-dependent actions on every page, and adds
// a small "history status" count badge next to the History nav link.
(async function initNav() {
  const actions = document.getElementById('nav-actions');
  if (!actions) return;

  // ---- mobile hamburger menu (CSS only shows it on small screens) ----
  const nav = actions.closest('.nav');
  const inner = nav && nav.querySelector('.nav-inner');
  if (nav && inner && !nav.querySelector('.nav-toggle')) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    inner.insertBefore(toggle, inner.querySelector('.nav-links') || actions);
    const setOpen = (open) => {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 720) setOpen(false);
    });
  }

  try {
    const { user } = await Api.me();
    actions.innerHTML = `
      <span class="muted" style="font-size:14px;">Hi, ${user.name.split(' ')[0]}</span>
      ${user.role === 'admin' ? '<a class="btn btn-ghost" href="/admin.html">Admin</a>' : ''}
      <a class="btn btn-ghost${document.querySelector('.nav-links a[href="/dashboard.html"]') ? ' nav-dup' : ''}" href="/dashboard.html">Dashboard</a>
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
