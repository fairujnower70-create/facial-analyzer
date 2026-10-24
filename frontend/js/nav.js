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
    // light / dark switch
    const themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'theme-toggle';
    const sunMoon = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle class="tt-sun" cx="12" cy="12" r="4"/><path class="tt-rays" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/><path class="tt-moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
    themeBtn.innerHTML = sunMoon;
    const paintTheme = () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      themeBtn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
      themeBtn.title = themeBtn.getAttribute('aria-label');
      themeBtn.classList.toggle('is-light', light);
    };
    themeBtn.addEventListener('click', () => {
      const light = document.documentElement.getAttribute('data-theme') !== 'light';
      if (light) document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('mien-theme', light ? 'light' : 'dark'); } catch (_) {}
      const m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', light ? '#f1f5f9' : '#0f172a');
      paintTheme();
    });
    paintTheme();
    inner.insertBefore(themeBtn, inner.querySelector('.nav-links') || actions);
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

    // ---- mobile bottom tab bar (CSS shows it only on small screens) ----
    if (!document.querySelector('.tabbar')) {
      const icons = {
        '/dashboard.html': '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        '/scan.html': '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/>',
        '/history.html': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        '/admin.html': '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/>'
      };
      const items = [['/dashboard.html', 'Home'], ['/scan.html', 'Scan'], ['/history.html', 'History']];
      if (user.role === 'admin') items.push(['/admin.html', 'Admin']);
      const bar = document.createElement('nav');
      bar.className = 'tabbar';
      bar.setAttribute('aria-label', 'Main');
      bar.innerHTML = items
        .map(
          ([href, label]) =>
            `<a href="${href}"${location.pathname === href ? ' class="active" aria-current="page"' : ''}>` +
            `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[href]}</svg>` +
            `<span>${label}</span></a>`
        )
        .join('');
      document.body.appendChild(bar);
      document.body.classList.add('has-tabbar');
    }

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

// Tables turn into stacked cards on phones. Copy each header label onto its
// cells (data-label) so the card can show "Age: 23" etc. Re-runs whenever
// the page re-renders table rows (search, delete, load).
(function labelTables() {
  const apply = () => {
    document.querySelectorAll('table').forEach((t) => {
      const heads = Array.from(t.querySelectorAll('thead th')).map((h) => h.textContent.trim());
      t.querySelectorAll('tbody tr').forEach((tr) => {
        Array.from(tr.children).forEach((td, i) => {
          if (heads[i] && td.getAttribute('data-label') !== heads[i]) td.setAttribute('data-label', heads[i]);
        });
      });
    });
  };
  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
})();

// Register the service worker so Mien can be installed on the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ---------- desktop + general polish (all display-only) ----------
(function polish() {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // nav gets a soft shadow once you scroll
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // cursor-following spotlight on cards and panels (mouse only)
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest && e.target.closest('.card, .panel');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  // pull-to-refresh when running as an installed app (browsers have their own)
  const isApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    (document.referrer || '').startsWith('android-app://') ||
    window.navigator.standalone === true;
  if (isApp && 'ontouchstart' in window) {
    const ind = document.createElement('div');
    ind.className = 'ptr';
    ind.innerHTML = '<span></span>';
    document.body.appendChild(ind);
    let y0 = 0, pull = 0, active = false;
    window.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0 && !e.target.closest('.modal-box')) { y0 = e.touches[0].clientY; active = true; pull = 0; }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!active) return;
      pull = Math.max(0, Math.min(110, (e.touches[0].clientY - y0) * 0.5));
      ind.style.transform = `translate(-50%, ${pull - 40}px) rotate(${pull * 4}deg)`;
      ind.style.opacity = String(Math.min(1, pull / 50));
      ind.classList.toggle('ready', pull > 60);
    }, { passive: true });
    window.addEventListener('touchend', () => {
      if (!active) return;
      active = false;
      if (pull > 60) {
        ind.classList.add('spin');
        setTimeout(() => location.reload(), 250);
      } else {
        ind.style.transform = 'translate(-50%, -40px)';
        ind.style.opacity = '0';
      }
    });
  }
})();
