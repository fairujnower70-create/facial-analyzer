// Mien homepage motion: scroll progress, reveal-on-scroll, count-up, typed
// word rotator, hero parallax tilt, live-updating hero chips.
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- scroll progress bar
  var bar = $('.hm-progress');
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')';
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- count-up numbers
  function countUp(el) {
    var end = parseFloat(el.dataset.count), suffix = el.dataset.suffix || '';
    if (reduce || !isFinite(end)) { el.textContent = end + suffix; return; }
    var t0 = performance.now(), dur = 1400;
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ---- reveal on scroll
  var items = $$('.reveal, .hm-steps, [data-count]');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); if (el.dataset.count) countUp(el); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        if (en.target.dataset.count) countUp(en.target);
        $$('[data-count]', en.target).forEach(countUp);
        io.unobserve(en.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
    // safety net: never leave content hidden
    setTimeout(function () { items.forEach(function (el) { if (!el.classList.contains('in') && el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }); }, 1800);
  }
  $$('.reveal').forEach(function (el, i) { if (!el.style.getPropertyValue('--rd') && el.dataset.rd) el.style.setProperty('--rd', el.dataset.rd + 's'); });

  // ---- typed word rotator
  var rw = $('.rw');
  if (rw) {
    var words = (rw.dataset.words || '').split('|').filter(Boolean), wi = 0, ci = 0, del = false;
    if (reduce || !words.length) { rw.textContent = words[0] || ''; }
    else (function type() {
      var w = words[wi];
      ci += del ? -1 : 1;
      rw.textContent = w.slice(0, ci);
      var d = del ? 32 : 75;
      if (!del && ci === w.length) { del = true; d = 1500; }
      else if (del && ci === 0) { del = false; wi = (wi + 1) % words.length; d = 320; }
      setTimeout(type, d);
    })();
  }

  // ---- hero tilt (mouse only)
  var vis = $('.hm-visual'), tilt = $('.hm-tilt');
  if (vis && tilt && !reduce && matchMedia('(pointer: fine)').matches) {
    var hero = $('.hm-hero');
    hero.addEventListener('mousemove', function (e) {
      var r = vis.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
      tilt.style.transform = 'rotateY(' + (x * 9).toFixed(2) + 'deg) rotateX(' + (-y * 9).toFixed(2) + 'deg)';
    });
    hero.addEventListener('mouseleave', function () { tilt.style.transform = ''; });
  }

  // ---- hero chips cycle through example readouts
  var c1 = $('.hm-chip.c1 [data-t]');
  if (c1 && !reduce) {
    var demo = [['Happy', '92%', '#10b981'], ['Funny', '71%', '#22d3ee'], ['Surprised', '88%', '#f59e0b'], ['Shy', '64%', '#f9a8d4'], ['Excited', '76%', '#e879f9']];
    var di = 0;
    setInterval(function () {
      di = (di + 1) % demo.length;
      var chip = c1.closest('.hm-chip');
      chip.style.opacity = 0;
      setTimeout(function () {
        c1.textContent = demo[di][0] + ' ';
        c1.nextElementSibling.textContent = demo[di][1];
        chip.style.setProperty('--i', demo[di][2]);
        chip.style.opacity = 1;
      }, 250);
    }, 2800);
    $('.hm-chip.c1').style.transition = 'opacity .25s';
  }
})();
