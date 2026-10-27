// Small dependency-free SVG chart kit for the admin console.
// All functions take a container element and plain data; colours come from
// the data or CSS variables so light/dark themes both work.
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
  const empty = (el, msg) => (el.innerHTML = `<p class="adm-empty">${esc(msg || 'No data yet.')}</p>`);
  let uid = 0;

  // ---------- tiny trend line inside KPI cards ----------
  function sparkline(values, color) {
    if (!values || values.length < 2) return '';
    const W = 120, H = 34, max = Math.max(1, ...values), min = Math.min(...values);
    const x = (i) => (i / (values.length - 1)) * W;
    const y = (v) => H - 3 - ((v - min) / Math.max(1, max - min)) * (H - 8);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const id = 'sp' + ++uid;
    return `<svg class="adm-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // ---------- multi-series smooth area/line chart ----------
  // series: [{ name, color, values:[] }], labels: [] (same length)
  function areaChart(el, series, labels) {
    const n = labels.length;
    if (!n || series.every((s) => s.values.every((v) => !v))) return empty(el, 'Activity will appear here once people start scanning.');
    const W = 640, H = 240, pl = 34, pr = 12, pt = 14, pb = 28;
    const max = Math.max(4, ...series.flatMap((s) => s.values));
    const top = Math.ceil(max / 4) * 4;
    const x = (i) => pl + (i / (n - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - v / top) * (H - pt - pb);
    const smooth = (vals) => {
      const pts = vals.map((v, i) => [x(i), y(v)]);
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
        d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
      }
      return d;
    };
    const grid = [0, 1, 2, 3, 4]
      .map((k) => {
        const v = (top / 4) * k, yy = y(v);
        return `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="adm-grid"/><text x="${pl - 8}" y="${yy + 4}" text-anchor="end" class="adm-axis">${fmt(Math.round(v))}</text>`;
      })
      .join('');
    const ticks = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
      .map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" class="adm-axis">${esc(labels[i].slice(5))}</text>`)
      .join('');
    const layers = series
      .map((s, si) => {
        const id = 'ar' + ++uid;
        const line = smooth(s.values);
        return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${si ? 0.18 : 0.38}"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>
          <path d="${line} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z" fill="url(#${id})" class="adm-area"/>
          <path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" class="adm-line"/>`;
      })
      .join('');
    const hits = labels
      .map((l, i) => `<g class="adm-hit"><rect x="${x(i) - (W / n) / 2}" y="${pt}" width="${W / n}" height="${H - pt - pb}" fill="transparent"/>
        ${series.map((s) => `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" fill="${s.color}" class="adm-pt"/>`).join('')}
        <title>${esc(l)} — ${series.map((s) => `${s.name}: ${s.values[i]}`).join(' · ')}</title></g>`)
      .join('');
    const legend = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="adm-svg" role="img" aria-label="Activity over the last 30 days">${grid}${ticks}${layers}${hits}</svg><div class="adm-legend">${legend}</div>`;
  }

  // ---------- donut with legend ----------
  // items: [{ label, value, color }]
  function donut(el, items, centerLabel) {
    const data = items.filter((i) => i.value > 0);
    const total = data.reduce((a, b) => a + b.value, 0);
    if (!total) return empty(el);
    const R = 54, C = 2 * Math.PI * R;
    let off = 0;
    const segs = data
      .map((d, i) => {
        const len = (d.value / total) * C;
        const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${d.color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2.5)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)" class="adm-seg" style="animation-delay:${i * 90}ms"><title>${esc(d.label)}: ${d.value}</title></circle>`;
        off += len;
        return s;
      })
      .join('');
    const legend = data
      .slice(0, 8)
      .map((d) => `<li><i style="background:${d.color}"></i><span>${esc(d.label)}</span><b>${Math.round((d.value / total) * 100)}%</b></li>`)
      .join('');
    el.innerHTML = `<div class="adm-donut"><svg viewBox="0 0 140 140" role="img" aria-label="${esc(centerLabel)}">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--bg-input)" stroke-width="16"/>${segs}
      <text x="70" y="69" text-anchor="middle" class="adm-donut-n">${fmt(total)}</text><text x="70" y="86" text-anchor="middle" class="adm-donut-l">${esc(centerLabel)}</text></svg>
      <ul class="adm-dlegend">${legend}</ul></div>`;
  }

  // ---------- horizontal bars ----------
  // items: [{ label, value, color, sub }]
  function hbars(el, items, valueSuffix) {
    const data = items.filter((i) => i.value > 0);
    if (!data.length) return empty(el);
    const max = Math.max(...data.map((d) => d.value));
    el.innerHTML = `<div class="adm-hbars">${data
      .map(
        (d, i) => `<div class="adm-hrow"><div class="adm-hlabel"><span>${esc(d.label)}</span><b>${d.value}${valueSuffix || ''}</b></div>
        <div class="adm-htrack"><div class="adm-hfill" style="width:${Math.max(4, (d.value / max) * 100)}%; background:${d.color}; animation-delay:${i * 70}ms"></div></div>${d.sub ? `<div class="adm-hsub">${esc(d.sub)}</div>` : ''}</div>`
      )
      .join('')}</div>`;
  }

  // ---------- vertical columns ----------
  function columns(el, items, color) {
    const max = Math.max(0, ...items.map((i) => i.count));
    if (!max) return empty(el);
    const W = 320, H = 170, pb = 26, pt = 18, gap = 10;
    const bw = (W - gap * (items.length + 1)) / items.length;
    const bars = items
      .map((it, i) => {
        const h = (it.count / max) * (H - pb - pt);
        const x = gap + i * (bw + gap), y = H - pb - h;
        return `<g><rect x="${x}" y="${y}" width="${bw}" height="${Math.max(2, h)}" rx="6" fill="${color}" class="adm-col" style="animation-delay:${i * 70}ms"><title>${esc(it.label)}: ${it.count}</title></rect>
          <text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="adm-axis">${it.count || ''}</text>
          <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="adm-axis">${esc(it.label)}</text></g>`;
      })
      .join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="adm-svg" role="img" aria-label="Age distribution">${bars}</svg>`;
  }

  // ---------- weekday x hour heatmap ----------
  // cells: [{ dow:0-6, hour:0-23, count }] — shown in the viewer's local time
  function heatmap(el, cells, accent) {
    if (!cells.length) return empty(el, 'Busy hours show up here after a few scans.');
    const off = -new Date().getTimezoneOffset() / 60; // hours from UTC
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    cells.forEach((c) => {
      let h = c.hour + off, d = c.dow;
      h = Math.round(h);
      while (h < 0) { h += 24; d = (d + 6) % 7; }
      while (h > 23) { h -= 24; d = (d + 1) % 7; }
      grid[d][h] += c.count;
    });
    const max = Math.max(1, ...grid.flat());
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const cw = 22, ch = 20, gap = 3, left = 34, top = 18;
    const W = left + 24 * (cw + gap), H = top + 7 * (ch + gap) + 4;
    let out = '';
    for (let h = 0; h < 24; h += 3) out += `<text x="${left + h * (cw + gap) + cw / 2}" y="11" text-anchor="middle" class="adm-axis">${h}h</text>`;
    grid.forEach((row, d) => {
      out += `<text x="0" y="${top + d * (ch + gap) + 14}" class="adm-axis">${days[d]}</text>`;
      row.forEach((v, h) => {
        const a = v ? 0.18 + (v / max) * 0.82 : 0.06;
        out += `<rect x="${left + h * (cw + gap)}" y="${top + d * (ch + gap)}" width="${cw}" height="${ch}" rx="5" fill="${accent}" fill-opacity="${a.toFixed(2)}"><title>${days[d]} ${h}:00 — ${v} scan${v === 1 ? '' : 's'}</title></rect>`;
      });
    });
    el.innerHTML = `<div class="adm-scroll"><svg viewBox="0 0 ${W} ${H}" class="adm-svg adm-heat" role="img" aria-label="Scan activity by weekday and hour">${out}</svg></div>`;
  }

  root.AdminCharts = { sparkline, areaChart, donut, hbars, columns, heatmap, esc };
})(window);
