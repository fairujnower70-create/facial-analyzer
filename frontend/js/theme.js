// Applies the saved light/dark choice before the page paints (no flash).
(function () {
  try {
    var t = localStorage.getItem('mien-theme');
    if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', '#f1f5f9');
    }
  } catch (_) {}
})();
