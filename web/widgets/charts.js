/* charts.js - SVG chart widgets for the web target: ring, donut, spark, area, heat, gantt, bars, dual, forecast.
   Every widget takes (element, options). Missing data (null/undefined/empty) renders the word "unavailable";
   no widget ever invents a value. No branding is emitted. */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  function svg(w, h, cls) { var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 " + w + " " + h);
    s.setAttribute("preserveAspectRatio", "none"); if (cls) s.setAttribute("class", cls); return s; }
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag);
    for (var k in attrs) { var val = attrs[k]; if (k === "stroke" || k === "fill" || k === "stop-color") val = th(val); else if (k === "style") val = String(val).replace(/#[0-9a-fA-F]{6}/g, th); e.setAttribute(k, val); }
    if (parent) parent.appendChild(e); return e; }
  function ok(v) { return v !== null && v !== undefined && !(typeof v === "number" && !isFinite(v)); }
  function series(d) { return Array.isArray(d) ? d.filter(ok) : []; }
  function unavailable(host, text) { host.innerHTML = '<div class="w-unavail">' + (text || "unavailable") + "</div>"; }
  function clear(host) { host.innerHTML = ""; }
  /* Theme awareness: colours are semantic roles resolved from the active theme's tokens (CSS custom properties set
     by applyTheme from a theme token collection). Callers may pass a role name ("accent", "success", "series3") or a
     colour; the built-in default colours below are roles too, so every chart re-colours when the theme changes. */
  var ROLE = {"#22d3ee": "accent", "#a78bfa": "accent2", "#34d399": "success", "#fbbf24": "warning", "#fb7185": "error", "#f43f5e": "error",
    "#60a5fa": "series3", "#f472b6": "series4", "#4ade80": "series5", "#64748b": "muted", "#334155": "track", "#0e7490": "accent-dim"};
  var DEF = {grid: "rgba(148,163,184,.14)", accent: "#22d3ee", accent2: "#a78bfa", accent3: "#f472b6", success: "#34d399", warning: "#fbbf24", error: "#fb7185", muted: "#64748b", text: "#e6f7ff", track: "rgba(148,163,184,.18)", "accent-dim": "#0e7490"};
  function cssv(n) { try { return getComputedStyle(document.documentElement).getPropertyValue("--" + n).trim(); } catch (e) { return ""; } }
  function th(c) { if (!c) return c; var role = ROLE[String(c).toLowerCase()] || (/^[a-z][a-z0-9-]*$/.test(c) ? c : null); if (!role) return c;
    var m = /^series(\d)$/.exec(role); return cssv(m ? "series-" + m[1] : role) || (m ? DEF.accent : DEF[role]) || c; }
  var palette = []; for (var pi = 0; pi < 8; pi++) palette.push("series" + pi);
  function applyTheme(t, root) { root = root || document.documentElement; var st = root.style, set = function (k, v) { if (v != null) st.setProperty("--" + k, v); };
    set("accent", t.accent_1); set("accent2", t.accent_2); set("accent3", t.accent_3); set("bg", t.background); set("plate", t.plate); set("raised", t.raised);
    set("border", t.border); set("text", t.text_primary); set("text2", t.text_secondary); set("muted", t.text_muted); set("success", t.success); set("warning", t.warning);
    set("error", t.error); set("focus", t.focus); set("track", (t.text_muted || "#94a3b8") + "33"); set("grid", (t.text_muted || "#94a3b8") + "26"); set("unavail", t.text_muted); set("accent-dim", t.accent_2);
    (t.chart_series || []).forEach(function (c, i) { set("series-" + i, c); });
    if (t.corner_radius_large_dip != null) set("radius-l", t.corner_radius_large_dip + "px"); if (t.corner_radius_small_dip != null) set("radius-s", t.corner_radius_small_dip + "px");
    if (t.motion_standard_ms != null) set("motion", t.motion_standard_ms + "ms"); }

  /* ring gauge: {value, max, label, sub, color, size} */
  function ring(host, o) {
    var max = o.max == null ? 100 : o.max;   // percentage rings default to 100; any other scale must pass max
    if (!ok(o.value) || !ok(max) || max <= 0) return unavailable(host);
    clear(host); var s = svg(100, 100, "w-ring"), f = Math.max(0, Math.min(1, o.value / max));
    var r = 40, c = 2 * Math.PI * r, col = o.stops ? stopColor(o.stops, o.value) : th(o.color || (o.invert ? "accent" : f > 0.9 ? "error" : f > 0.75 ? "warning" : "accent"));
    el("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: th("track"), "stroke-width": 9}, s);
    el("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: col, "stroke-width": 9, "stroke-linecap": "round",
      "stroke-dasharray": (c * f) + " " + c, transform: "rotate(-90 50 50)", style: "filter:drop-shadow(0 0 4px " + col + ")"}, s);
    var t = el("text", {x: 50, y: o.sub ? 50 : 56, "text-anchor": "middle", class: "w-ring-v"}, s); t.textContent = o.label != null ? o.label : Math.round(f * 100) + "%";
    if (o.sub) { var u = el("text", {x: 50, y: 66, "text-anchor": "middle", class: "w-ring-s"}, s); u.textContent = o.sub; }
    if (o.value > max) { var ov = el("text", {x: 50, y: 84, "text-anchor": "middle", class: "w-ring-s"}, s); ov.textContent = "over max"; }
    label(s, (o.title || o.sub || "ring gauge"), fmt(o.value) + " of " + fmt(max) + (o.unit || ""));
    s.setAttribute("preserveAspectRatio", "xMidYMid meet"); host.appendChild(s);
  }

  /* colour stops: [{at: value, color: role-or-colour}], ascending. Colours interpolate between stops; at or above
     the last stop the last colour holds (e.g. red from 80 °C up). Roles resolve from the active theme. */
  var TEMP_STOPS = [{at: 30, color: "accent-dim"}, {at: 45, color: "accent"}, {at: 60, color: "success"}, {at: 70, color: "warning"}, {at: 76, color: "#fb923c"}, {at: 80, color: "error"}];
  function stopColor(stops, v) { var st = stops.map(function (x) { return {at: x.at, c: rgb(th(x.color))}; });
    if (v <= st[0].at) return "rgb(" + st[0].c.join(",") + ")"; if (v >= st[st.length - 1].at) return "rgb(" + st[st.length - 1].c.join(",") + ")";
    for (var i = 0; i < st.length - 1; i++) if (v <= st[i + 1].at) { var t = (v - st[i].at) / (st[i + 1].at - st[i].at), a = st[i].c, b = st[i + 1].c;
      return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * t); }).join(",") + ")"; } }

  /* gradient dial: {value, min, max, stops, unit, label, sub, title, thresholds:[{at,label}], sweep}
     A 270-degree arc painted with the colour-stop gradient along its length (cool -> hot), a needle and value
     fill whose colour follows the value, and optional threshold ticks. Defaults suit temperatures (red from 80). */
  function dial(host, o) {
    var mn = o.min == null ? 20 : o.min, mx = o.max == null ? 100 : o.max, stops = o.stops || TEMP_STOPS;
    if (!ok(o.value) || !(mx > mn)) return unavailable(host, o.empty);
    clear(host); var s = svg(100, 100, "w-dial"); s.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var sweep = o.sweep || 270, a0 = 90 + (360 - sweep) / 2, r = 38, cx = 50, cy = 54, N = 54;
    function pt(deg, rr) { var a = deg * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; }
    function at(v) { return a0 + Math.max(0, Math.min(1, (v - mn) / (mx - mn))) * sweep; }
    for (var i = 0; i < N; i++) { var v0 = mn + (mx - mn) * i / N, v1 = mn + (mx - mn) * (i + 1) / N, p0 = pt(at(v0), r), p1 = pt(at(v1) + .4, r);
      el("path", {d: "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + "A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2), fill: "none", stroke: stopColor(stops, (v0 + v1) / 2), "stroke-width": 8, opacity: v1 <= o.value ? 1 : .28}, s); }
    (o.thresholds || [{at: stops[stops.length - 1].at}]).forEach(function (t) { var q = pt(at(t.at), r + 6), q2 = pt(at(t.at), r - 6); el("line", {x1: q[0], y1: q[1], x2: q2[0], y2: q2[1], stroke: "text", "stroke-width": 1.2, opacity: .7}, s); });
    var col = stopColor(stops, o.value), tip = pt(at(o.value), r - 4), b1 = pt(at(o.value) + 90, 3), b2 = pt(at(o.value) - 90, 3);
    el("path", {d: "M" + tip[0].toFixed(2) + " " + tip[1].toFixed(2) + "L" + b1[0].toFixed(2) + " " + b1[1].toFixed(2) + "L" + b2[0].toFixed(2) + " " + b2[1].toFixed(2) + "Z", fill: col, style: "filter:drop-shadow(0 0 3px " + col + ")"}, s);
    el("circle", {cx: cx, cy: cy, r: 4, fill: col}, s);
    var t = el("text", {x: 50, y: 84, "text-anchor": "middle", class: "w-ring-v", style: "fill:" + col}, s); t.textContent = o.label != null ? o.label : fmt(o.value) + (o.unit || "");
    if (o.sub) { var u = el("text", {x: 50, y: 95, "text-anchor": "middle", class: "w-ring-s"}, s); u.textContent = o.sub; }
    label(s, o.title || "dial gauge", fmt(o.value) + (o.unit || "") + " on " + fmt(mn) + "–" + fmt(mx) + (o.unit || ""));
    host.appendChild(s);
  }

  /* donut: {segments:[{label,value,color}], center, sub} */
  function donut(host, o) {
    var seg = (o.segments || []).filter(function (x) { return ok(x.value) && x.value >= 0; });
    var tot = seg.reduce(function (a, x) { return a + x.value; }, 0);
    if (!seg.length) return unavailable(host);
    clear(host); host.classList.add("w-host"); var s = svg(100, 100, "w-donut"); s.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var r = 38, c = 2 * Math.PI * r, off = 0;
    el("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: th("track"), "stroke-width": 13}, s);
    if (tot > 0) seg.forEach(function (x, i) { var len = c * x.value / tot; var col = th(x.color || palette[i % palette.length]);
      el("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: col, "stroke-width": 13, "stroke-dasharray": len + " " + (c - len),
        "stroke-dashoffset": -off, transform: "rotate(-90 50 50)"}, s); off += len; });
    var t = el("text", {x: 50, y: o.sub ? 51 : 56, "text-anchor": "middle", class: "w-ring-v"}, s); t.textContent = o.center != null ? o.center : tot;
    if (o.sub) { var u = el("text", {x: 50, y: 64, "text-anchor": "middle", class: "w-ring-s"}, s); u.textContent = o.sub; }
    label(s, o.title || "donut chart", seg.map(function (x) { return x.label + " " + x.value + (tot ? " (" + Math.round(x.value / tot * 100) + "%)" : ""); }).join(", "));
    host.appendChild(s);
    if (o.legend !== false) { var lg = document.createElement("div"); lg.className = "w-legend";
      seg.forEach(function (x, i) { lg.innerHTML += '<span><i style="background:' + th(x.color || palette[i % palette.length]) + '"></i>' + x.label + " <b>" + x.value + "</b></span>"; });
      host.appendChild(lg); }
  }

  function scale(vals, lo, hi) { var mn = lo != null ? lo : Math.min.apply(null, vals), mx = hi != null ? hi : Math.max.apply(null, vals);
    if (mx === mn) { mx = mn + 1; } return [mn, mx]; }
  /* x position on a shared index domain of n points; null values break the line (a gap), never a zero */
  function X(i, n, w) { return n < 2 ? w : i * w / (n - 1); }
  function Y(v, h, mn, mx, pad) { pad = pad == null ? 2 : pad; return h - pad - (v - mn) / (mx - mn) * (h - 2 * pad); }
  function segs(d) { var out = [], cur = null; d.forEach(function (v, i) { if (ok(v)) { if (!cur) { cur = []; out.push(cur); } cur.push([i, v]); } else cur = null; }); return out; }
  function path(d, w, h, mn, mx, pad, n) { n = n || d.length; return segs(d).map(function (sg) { return sg.map(function (p, k) { return (k ? "L" : "M") + X(p[0], n, w).toFixed(1) + " " + Y(p[1], h, mn, mx, pad).toFixed(1); }).join(""); }).join(""); }
  /* closed fill per contiguous segment, down to a baseline series (or the bottom) */
  function fillPath(top, base, w, h, mn, mx, n) { return segs(top).map(function (sg) {
      var up = sg.map(function (p, k) { return (k ? "L" : "M") + X(p[0], n, w).toFixed(1) + " " + Y(p[1], h, mn, mx).toFixed(1); }).join("");
      var down = sg.slice().reverse().map(function (p) { var b = base && ok(base[p[0]]) ? Y(base[p[0]], h, mn, mx) : h; return "L" + X(p[0], n, w).toFixed(1) + " " + b.toFixed(1); }).join("");
      return up + down + "Z"; }).join(""); }
  var gid = 0;
  function grad(s, col) { var id = "g" + (++gid); var d = el("defs", {}, s); var g = el("linearGradient", {id: id, x1: 0, y1: 0, x2: 0, y2: 1}, d);
    el("stop", {offset: "0", "stop-color": col, "stop-opacity": ".55"}, g); el("stop", {offset: "1", "stop-color": col, "stop-opacity": "0"}, g); return "url(#" + id + ")"; }
  function grid(s, w, h) { for (var gl = 1; gl < 4; gl++) el("line", {x1: 0, x2: w, y1: h * gl / 4, y2: h * gl / 4, stroke: th("grid"), "stroke-width": 1, "vector-effect": "non-scaling-stroke"}, s); }
  function label(s, title, desc) { s.setAttribute("role", "img"); var t = el("title", {}, s); t.textContent = title || "chart"; if (desc) { var d = el("desc", {}, s); d.textContent = desc; } s.insertBefore(t, s.firstChild); }
  function summary(d) { var v = series(d); if (!v.length) return "no data"; return "last " + fmt(v[v.length - 1]) + ", min " + fmt(Math.min.apply(null, v)) + ", max " + fmt(Math.max.apply(null, v)) + ", " + (d.length - v.length) + " gaps"; }

  /* sparkline with area fill: {data, color, min, max, title} - gaps stay gaps */
  function spark(host, o) {
    var d = Array.isArray(o.data) ? o.data : []; if (series(d).length < 2) return unavailable(host, o.empty);
    clear(host); var w = 200, h = 50, s = svg(w, h, "w-spark"), col = o.color || "accent", m = scale(series(d), o.min, o.max);
    label(s, o.title || "sparkline", summary(d));
    el("path", {d: fillPath(d, null, w, h, m[0], m[1], d.length), fill: grad(s, col)}, s);
    el("path", {d: path(d, w, h, m[0], m[1]), fill: "none", stroke: col, "stroke-width": 1.8, "vector-effect": "non-scaling-stroke"}, s); host.appendChild(s);
  }

  /* area / multi-line chart: {series:[{label,data,color}], stacked, fill, min, max, unit, forecast, marks, title}
     All series share one index domain (the longest). Missing points are gaps; a stacked layer is a gap wherever it
     or any layer below it is missing. Negative values are refused for stacks (rendered unavailable). */
  function area(host, o) {
    var ss = (o.series || []).filter(function (x) { return series(x.data).length >= 2; });
    if (!ss.length) return unavailable(host, o.empty);
    var n = Math.max.apply(null, ss.map(function (x) { return x.data.length; }));
    if (o.stacked && ss.some(function (x) { return series(x.data).some(function (v) { return v < 0; }); })) return unavailable(host, "negative values cannot be stacked");
    clear(host); var w = 400, h = 140, s = svg(w, h, "w-area"); grid(s, w, h);
    var below = null, all = [];
    ss.forEach(function (x) { var pad = n - x.data.length, d = new Array(pad).fill(null).concat(x.data);   // right-align on "now"
      x.al = d; x.top = d.map(function (v, i) { if (!ok(v)) return null; if (!o.stacked) return v; var b = below ? below[i] : 0; return ok(b) ? b + v : null; });
      x.base = o.stacked ? below : null; below = x.top; all = all.concat(series(x.top)); });
    var fc = o.forecast || []; all = all.concat(series(fc));   // forecast keeps its indexes; nulls become gaps
    var m = scale(all.concat(o.min != null ? [o.min] : []), o.min, o.max);
    var N = n + fc.length, hw = fc.length ? w * (n - 1) / (N - 1) : w;     // one coordinate system for history and forecast
    ss.forEach(function (x, i) { var col = x.color || palette[i % palette.length];
      if (o.fill !== false) el("path", {d: fillPath(x.top, x.base, w, h, m[0], m[1], fc.length ? N : n), fill: o.stacked ? th(col) : grad(s, col), "fill-opacity": o.stacked ? .38 : 1}, s);
      el("path", {d: path(x.top, w, h, m[0], m[1], 2, fc.length ? N : n), fill: "none", stroke: col, "stroke-width": 1.9, "vector-effect": "non-scaling-stroke"}, s); });
    if (fc.length) { var last = ss[0].top[n - 1];
      var runs = [], cur = ok(last) && ok(fc[0]) ? [[n - 1, last]] : [];
      fc.forEach(function (v, k) { if (ok(v)) cur.push([n + k, v]); else { if (cur.length > 1) runs.push(cur); cur = []; } }); if (cur.length > 1) runs.push(cur);
      runs.forEach(function (pts) { el("path", {d: pts.map(function (p, k) { return (k ? "L" : "M") + X(p[0], N, w).toFixed(1) + " " + Y(p[1], h, m[0], m[1]).toFixed(1); }).join(""), fill: "none", stroke: "warning", "stroke-dasharray": "4 3", "stroke-width": 1.7, "vector-effect": "non-scaling-stroke"}, s); });
      el("line", {x1: hw, x2: hw, y1: 0, y2: h, stroke: th("grid"), "stroke-dasharray": "2 3", "vector-effect": "non-scaling-stroke"}, s); }
    (o.marks || []).forEach(function (k) { if (k < n) el("circle", {cx: X(k, fc.length ? N : n, w), cy: 8, r: 3.5, fill: "error"}, s); });
    label(s, o.title || "area chart", ss.map(function (x) { return x.label + ": " + summary(x.data); }).join("; "));
    var pb = plotBox(host); pb.appendChild(s); if (o.yaxis !== false) yaxis(pb, m[0], m[1], o.unit); else host.classList.add("w-noy"); xaxis(host, o);
    var lg = document.createElement("div"); lg.className = "w-legend"; lg.innerHTML = "";
    ss.forEach(function (x, i) { var v = series(x.data); lg.innerHTML += '<span><i style="background:' + th(x.color || palette[i % palette.length]) + '"></i>' + x.label + (v.length ? " <b>" + fmt(v[v.length - 1]) + "</b>" : "") + "</span>"; });
    if (fc.length) lg.innerHTML += '<span><i style="background:' + th("warning") + '"></i>forecast</span>';
    if (o.legend !== false) host.appendChild(lg);
  }
  function fmt(v) { return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : (Math.round(v * 10) / 10).toString(); }

  /* dual axis: {a:{label,data,color,unit}, b:{...}} - each series on its own labelled axis, gaps preserved */
  function dual(host, o) {
    var A = (o.a && o.a.data) || [], B = (o.b && o.b.data) || [];
    if (series(A).length < 2 && series(B).length < 2) return unavailable(host, o.empty);
    clear(host); var w = 400, h = 140, s = svg(w, h, "w-area"); grid(s, w, h); var n = Math.max(A.length, B.length);
    var lg = document.createElement("div"), desc = []; lg.className = "w-legend";
    [[o.a, A, "accent", "left"], [o.b, B, "accent2", "right"]].forEach(function (z) { if (series(z[1]).length < 2) { lg.innerHTML += "<span>" + (z[0] ? z[0].label : "") + ": unavailable</span>"; return; }
      var col = z[0].color || z[2], m = scale(series(z[1]), 0); var d = new Array(n - z[1].length).fill(null).concat(z[1]);
      el("path", {d: path(d, w, h, m[0], m[1], 2, n), fill: "none", stroke: col, "stroke-width": 1.9, "vector-effect": "non-scaling-stroke"}, s);
      desc.push(z[0].label + " (" + z[3] + " axis 0-" + fmt(m[1]) + (z[0].unit || "") + "): " + summary(z[1]));
      lg.innerHTML += '<span><i style="background:' + th(col) + '"></i>' + z[0].label + " · " + z[3] + " axis 0–" + fmt(m[1]) + (z[0].unit || "") + "</span>"; });
    label(s, o.title || "dual-axis chart", desc.join("; ")); var pb = plotBox(host); pb.appendChild(s);
    if (series(A).length >= 2) yaxis(pb, 0, scale(series(A), 0)[1], (o.a.unit || ""), "left"); if (series(B).length >= 2) yaxis(pb, 0, scale(series(B), 0)[1], (o.b.unit || ""), "right");
    xaxis(host, o); host.appendChild(lg);
  }

  /* heat map: {rows:[label], cols:n | [label], values:[[v|null]], min, max, unit, scale:true} */
  function heat(host, o) {
    var vals = (o.values || []); var flat = []; vals.forEach(function (r) { (r || []).forEach(function (v) { if (ok(v)) flat.push(v); }); });
    if (!flat.length) return unavailable(host, o.empty);
    clear(host); var mn = o.min != null ? o.min : Math.min.apply(null, flat), mx = o.max != null ? o.max : Math.max.apply(null, flat); if (mx === mn) mx = mn + 1;
    var wrap = document.createElement("div"); wrap.className = "w-heat"; wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", (o.title || "heat map") + ", " + fmt(mn) + " to " + fmt(mx) + (o.unit || ""));
    var cols = Math.max.apply(null, vals.map(function (r) { return (r || []).length; }));
    vals.forEach(function (r, ri) { var row = document.createElement("div"); row.className = "w-heat-row";
      row.innerHTML = '<span class="w-heat-l">' + ((o.rows || [])[ri] || "") + "</span>";
      var cells = document.createElement("div"); cells.className = "w-heat-cells"; cells.style.gridTemplateColumns = "repeat(" + cols + ",1fr)";
      for (var ci = 0; ci < cols; ci++) { var v = (r || [])[ci]; var c = document.createElement("i");
        if (ok(v)) { c.style.background = heatColor((v - mn) / (mx - mn)); c.title = fmt(v) + (o.unit || ""); } else { c.className = "na"; c.title = "unavailable"; }
        cells.appendChild(c); }
      row.appendChild(cells); wrap.appendChild(row); });
    host.classList.add("w-host"); host.appendChild(wrap); xaxis(host, o);
    var colLabels = o.cols && o.cols.length ? o.cols : null;
    tableEq(host, (o.title || "heat map") + (o.unit ? " (" + o.unit + ")" : ""), ["row"].concat(colLabels || ["min", "mean", "max", "latest", "gaps"]),
      vals.map(function (r, ri) { var v = (r || []).filter(ok), lbl = (o.rows || [])[ri] || ("row " + ri);
        if (colLabels) return [lbl].concat(colLabels.map(function (_, ci) { return ok((r || [])[ci]) ? fmt(r[ci]) : "unavailable"; }));
        return [lbl, v.length ? fmt(Math.min.apply(null, v)) : "unavailable", v.length ? fmt(v.reduce(function (a, x) { return a + x; }, 0) / v.length) : "unavailable", v.length ? fmt(Math.max.apply(null, v)) : "unavailable", v.length ? fmt(v[v.length - 1]) : "unavailable", String((r || []).length - v.length)]; }));
    if (o.scale !== false) { var sc = document.createElement("div"); sc.className = "w-heat-scale";
      sc.innerHTML = "<span>" + fmt(mn) + (o.unit || "") + "</span><b style=\"background:linear-gradient(90deg," + heatStops().map(function (c) { return "rgb(" + c.join(",") + ")"; }).join(",") + ")\"></b><span>" + fmt(mx) + (o.unit || "") + "</span>"; host.appendChild(sc); }
  }
  function rgb(c) { c = String(c).trim(); var m = /^#([0-9a-f]{6})/i.exec(c); if (m) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
    m = /rgba?\(([^)]+)\)/.exec(c); return m ? m[1].split(",").slice(0, 3).map(Number) : [128, 128, 128]; }
  function heatStops() { return ["accent-dim", "accent", "success", "warning", "error"].map(function (r) { return rgb(th(r)); }); }
  function heatColor(f) { f = Math.max(0, Math.min(1, f)); var stops = heatStops();
    var p = f * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), t = p - i, a = stops[i], b = stops[i + 1];
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * t); }).join(",") + ")"; }

  /* gantt timeline: {lanes:[{label, bars:[{start,end,color,label}]}], t0, t1, ticks} (times in seconds) */
  function gantt(host, o) {
    var lanes = o.lanes || []; var any = lanes.some(function (l) { return (l.bars || []).length; });
    if (!lanes.length || !any) return unavailable(host, o.empty);
    if (!ok(o.t0) || !ok(o.t1) || o.t1 <= o.t0) return unavailable(host, "invalid time range"); clear(host); var t0 = o.t0, t1 = o.t1;
    var wrap = document.createElement("div"); wrap.className = "w-gantt"; wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", (o.title || "timeline") + ": " + lanes.map(function (l) { return l.label + " " + (l.bars || []).length + " bars"; }).join(", "));
    lanes.forEach(function (l) { var row = document.createElement("div"); row.className = "w-gantt-row";
      row.innerHTML = '<span class="w-gantt-l">' + l.label + '</span><div class="w-gantt-track"></div>'; var tr = row.lastChild;
      (l.bars || []).forEach(function (b) { var a = Math.max(t0, b.start), z = Math.min(t1, b.end); if (z <= a) return;
        var d = document.createElement("i"); d.style.left = ((a - t0) / (t1 - t0) * 100) + "%"; d.style.width = Math.max(.6, (z - a) / (t1 - t0) * 100) + "%";
        d.style.background = th(b.color || "accent"); d.title = b.label || ""; tr.appendChild(d); });
      wrap.appendChild(row); });
    var ax = document.createElement("div"); ax.className = "w-gantt-axis"; var tk = ""; for (var q = 0; q <= 4; q++) tk += "<span>" + relTime(t0 + (t1 - t0) * q / 4, o.now || t1, (o.now || t1) - t0) + "</span>";
    ax.innerHTML = tk; wrap.appendChild(ax); host.classList.add("w-host"); host.appendChild(wrap);
    var rows = []; lanes.forEach(function (l) { (l.bars || []).forEach(function (b) { if (b.end > t0 && b.start < t1) rows.push([l.label, b.label || "", relTime(b.start, o.now || t1), relTime(b.end, o.now || t1), fmt(b.end - b.start) + " s"]); }); });
    tableEq(host, o.title || "timeline", ["lane", "what", "start", "end", "duration"], rows.length ? rows : [["—", "no bars in range", "", "", ""]]);
  }

  /* horizontal bars: {items:[{label,value,max,color,text}]} */
  /* horizontal bars: {items:[{label,value,max,min,color,text}]} - signed scale: domain [min(0,min), max(0,max)] with a
     visible zero baseline; negative values grow left of zero. Values beyond the domain are clipped and marked. */
  function bars(host, o) {
    var it = o.items || []; if (!it.length) return unavailable(host, o.empty);
    clear(host); var wrap = document.createElement("div"); wrap.className = "w-bars"; wrap.setAttribute("role", "list");
    it.forEach(function (x, i) { var has = ok(x.value) && ok(x.max) && x.max > (x.min || 0) - 1e-12 && x.max !== (x.min || 0);
      var row = document.createElement("div"); row.className = "w-bar"; row.setAttribute("role", "listitem");
      if (!has) { row.innerHTML = "<span>" + x.label + '</span><div class="w-bar-t"></div><b class="na">unavailable</b>'; wrap.appendChild(row); return; }
      var lo = Math.min(0, x.min == null ? 0 : x.min), hi = Math.max(0, x.max), z = (0 - lo) / (hi - lo), v = Math.max(lo, Math.min(hi, x.value)), f = (v - lo) / (hi - lo);
      var left = Math.min(z, f) * 100, width = Math.abs(f - z) * 100, clip = x.value > hi || x.value < lo;
      row.innerHTML = "<span>" + x.label + '</span><div class="w-bar-t">' + '<u style="left:' + (z * 100) + '%"></u>' + '<i style="left:' + left + "%;width:" + width + "%;background:" + th(x.color || palette[i % palette.length]) + '"></i></div><b>' + (x.text || fmt(x.value)) + (clip ? " ▸" : "") + "</b>";
      row.setAttribute("aria-label", x.label + ": " + (x.text || fmt(x.value)) + (clip ? " (beyond scale)" : "")); wrap.appendChild(row); });
    host.appendChild(wrap);
  }

  /* column chart: {items:[{label,value,color}], unit} - signed scale with a zero baseline; missing categories stay
     in place as "unavailable" */
  function columns(host, o) {
    var all = o.items || [], vals = all.filter(function (x) { return ok(x.value); }).map(function (x) { return x.value; }); if (!vals.length) return unavailable(host, o.empty);
    clear(host); var hi = Math.max(0, Math.max.apply(null, vals)), lo = Math.min(0, Math.min.apply(null, vals)); if (hi === lo) hi = lo + 1;
    var z = hi / (hi - lo); var wrap = document.createElement("div"); wrap.className = "w-cols"; wrap.setAttribute("role", "list");
    all.forEach(function (x, i) { var col = document.createElement("div"); col.className = "w-col"; col.setAttribute("role", "listitem");
      if (!ok(x.value)) { col.innerHTML = '<div class="w-col-a"></div><b class="na">unavailable</b><span>' + x.label + "</span>"; wrap.appendChild(col); return; }
      var hpct = Math.abs(x.value) / (hi - lo) * 100, top = x.value >= 0 ? (z * 100 - hpct) : z * 100;
      col.innerHTML = '<div class="w-col-a"><u style="top:' + (z * 100) + '%"></u><i style="top:' + top + "%;height:" + hpct + "%;background:" + th(x.color || palette[i % palette.length]) + '"></i></div><b>' + fmt(x.value) + (o.unit || "") + "</b><span>" + x.label + "</span>";
      col.setAttribute("aria-label", x.label + ": " + fmt(x.value) + (o.unit || "")); wrap.appendChild(col); });
    host.appendChild(wrap);
    var ax = document.createElement("div"); ax.className = "w-legend"; ax.innerHTML = "<span class='w-axis'>scale " + fmt(lo) + " to " + fmt(hi) + (o.unit || "") + " · baseline 0</span>"; host.appendChild(ax);
  }

  /* ---- axes and table equivalents (shared) ---- */
  function relTime(t, now, span) { var a = Math.max(0, Math.round(now - t)); if (a < 1) return "now"; span = span || a;
    if (span < 120) return "-" + a + "s"; if (span < 7200) return "-" + (+(a / 60).toFixed(a < 600 && a % 60 ? 1 : 0)) + "m"; return "-" + (a / 3600).toFixed(1) + "h"; }
  /* x axis: o.time = {t0, t1} (seconds) -> 5 ticks; or o.xticks = [labels]; o.xlabel names the axis */
  function xaxis(host, o) { var labels = o.xticks;
    if (!labels && o.time && ok(o.time.t0) && ok(o.time.t1) && o.time.t1 > o.time.t0) { labels = []; for (var i = 0; i <= 4; i++) labels.push(relTime(o.time.t0 + (o.time.t1 - o.time.t0) * i / 4, o.time.now || o.time.t1, (o.time.now || o.time.t1) - o.time.t0)); }
    if (!labels) return; var ax = document.createElement("div"); ax.className = "w-xaxis"; ax.setAttribute("aria-hidden", "true");
    ax.innerHTML = labels.map(function (l) { return "<span>" + l + "</span>"; }).join("") + ""; host.appendChild(ax);
    if (o.xlabel) { var xl = document.createElement("div"); xl.className = "w-xlabel"; xl.textContent = o.xlabel; host.appendChild(xl); } }
  /* y axis labels over the plot at the gridlines (top = max, bottom = min) */
  function yaxis(plot, mn, mx, unit, side) { var y = document.createElement("div"); y.className = "w-yaxis" + (side === "right" ? " r" : ""); y.setAttribute("aria-hidden", "true");
    for (var i = 0; i <= 4; i++) { var v = mx - (mx - mn) * i / 4; y.innerHTML += '<span style="top:' + (i * 25) + '%">' + fmt(v) + (i === 0 && unit ? unit : "") + "</span>"; } plot.appendChild(y); }
  function plotBox(host) { host.classList.add("w-host"); var b = document.createElement("div"); b.className = "w-plot"; host.appendChild(b); return b; }
  /* a table equivalent behind a small "Table" toggle; screen readers get it either way */
  function tableEq(host, caption, head, rows) { var d = document.createElement("details"); d.className = "w-table";
    d.innerHTML = "<summary>Table</summary><div class='w-table-b'><table><caption>" + caption + "</caption><tr>" + head.map(function (h) { return "<th scope='col'>" + h + "</th>"; }).join("") + "</tr>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return i ? "<td>" + c + "</td>" : "<th scope='row'>" + c + "</th>"; }).join("") + "</tr>"; }).join("") + "</table></div>";
    d.addEventListener("toggle", function () { host.classList.toggle("w-table-open", d.open); }); host.classList.add("w-has-table"); host.appendChild(d); }

  root.Charts = {theme: applyTheme, color: th, dial: dial, stopColor: stopColor, TEMP_STOPS: TEMP_STOPS, ring: ring, donut: donut, spark: spark, area: area, dual: dual, heat: heat, heatColor: heatColor, gantt: gantt, bars: bars, columns: columns, unavailable: unavailable, fmt: fmt, palette: palette};
})(typeof window !== "undefined" ? window : this);
