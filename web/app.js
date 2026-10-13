/* Strata Monitor front end. Read-only: every number shown comes from Strata's GET endpoints or from the
   monitor's own rolling record of them. Anything Strata does not report is shown as "unavailable". */
(function () {
"use strict";
var C = window.Charts, $ = function (s, r) { return (r || document).querySelector(s); };
var D = {m: null, vs: null, st: null, slots: null, hist: [], cfg: null, props: null, mcp: null, prom: null, health: null, info: null, diag: null, at: 0, err: null};
var UI = {page: 0, range: 300, paused: false, events: [], seenReq: {}, lastPhase: null, feedPaused: false, feedFilter: "all", alerts: []};
var NA = '<span class="na">unavailable</span>';
function ok(v) { return v !== null && v !== undefined && !(typeof v === "number" && !isFinite(v)); }
function v(x, f) { return ok(x) ? (f ? f(x) : x) : NA; }
function n1(x) { return (Math.round(x * 10) / 10).toLocaleString(); }
function gb(b) { return (b / 1073741824).toFixed(1); }
function pct(a, b) { return ok(a) && ok(b) && b > 0 ? a / b * 100 : null; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
function dur(s) { if (!ok(s)) return NA; s = Math.floor(s); var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return (d ? d + "d " : "") + h + "h " + m + "m"; }
function ago(t) { var s = Date.now() / 1000 - t; return s < 60 ? s.toFixed(1) + "s" : s < 3600 ? Math.round(s / 60) + "m" : (s / 3600).toFixed(1) + "h"; }
function quant(a, q) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
var ICON = {
  serve: '<path d="M4 6h16v5H4zM4 13h16v5H4z"/><circle cx="8" cy="8.5" r=".8"/><circle cx="8" cy="15.5" r=".8"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', act: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>', grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  bell: '<path d="M6 17V11a6 6 0 0112 0v6l2 2H4z"/>', flow: '<path d="M3 7h12l-3-3M21 17H9l3 3"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pie: '<path d="M12 3v9h9a9 9 0 11-9-9z"/>', gauge: '<path d="M4 18a8 8 0 1116 0"/><path d="M12 18l4-6"/>', shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', stetho: '<path d="M6 3v6a5 5 0 0010 0V3"/><circle cx="18" cy="16" r="3"/><path d="M11 14v2a5 5 0 005 5"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4"/>', db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/>', trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>'};
function ic(k) { return '<svg viewBox="0 0 24 24">' + (ICON[k] || ICON.grid) + "</svg>"; }

/* ---------- pages: each card = [id, icon, title, subtitle, colSpan, rowSpan] ---------- */
var PAGES = [
 {key: "overview", name: "Overview", icon: "grid", title: "Strata Monitor", sub: "Live inference, performance and GPU observability", rows: 12, fit: true, cards: [
  ["opower", "bolt", "Total power draw", "All GPUs combined against the combined limit", 6, 3], ["perf", "bolt", "Performance", "Token throughput (live, per sample)", 6, 3],
  ["serving", "serve", "Serving", "Model and request state", 4, 5], ["batching", "layers", "Batching / Parallelism", "Scheduler, slots and groups", 4, 5], ["hardware", "chip", "Hardware", "Detected GPUs, RAM and VRAM pressure", 4, 5],
  ["requests", "list", "Requests", "Live slots and recently finished requests", 6, 4], ["activity", "act", "Activity", "Events seen by this monitor", 6, 4]]},
 {key: "chat", name: "Chat", icon: "chat", title: "Chat", sub: "Talk to the loaded model through Strata's own chat endpoint", rows: 6, fit: true, cards: [
  ["chatbox", "chat", "Conversation", "Streams from /v1/chat/completions, with thinking and MCP tools", 9, 6], ["chatset", "gear", "Sampling & thinking", "Per-chat settings, or shared defaults for every app", 3, 6]]},
 {key: "fleet", name: "GPU Fleet Lab", icon: "chip", title: "GPU Fleet Lab", sub: "Every GPU Strata reports, with thermals, memory and power", rows: 6, tracks: "20fr 20fr 29fr 11fr 20fr 20fr", fit: true, cards: [
  ["power", "bolt", "Total power draw", "All GPUs combined against the combined limit", 4, 2], ["gpucards", "chip", "GPUs", "Per card: utilization, temperature dial, power, VRAM", 8, 3],
  ["alerts", "bell", "Alerts", "Derived from live readings", 4, 2],
  ["thermal", "fire", "Thermal heat map", "Temperature per GPU over time", 4, 3], ["fleetsum", "gauge", "Fleet summary", "Totals across all detected GPUs", 4, 3],
  ["pcie", "plug", "PCIe, clocks & fans", "Per GPU link, traffic, clocks (driver tool)", 4, 2]]},
 {key: "flow", name: "Request Flow", icon: "flow", title: "Request Flow", sub: "Queue, admission, slots and the scheduler over time", rows: 11, fit: true, cards: [
  ["pipeline", "flow", "Pipeline", "Live count per stage", 12, 2], ["queue", "list", "Queue depth", "Total, engine queue and pre-admit waiting", 4, 3],
  ["latency", "clock", "Latency", "p50 / p95 request duration, finished requests", 4, 3], ["parallel", "layers", "Parallel vs slots", "Running requests against configured slots", 4, 3],
  ["active", "list", "Active requests", "Stage, tokens, slot and harness", 7, 3], ["mix", "pie", "Request mix", "How recent requests finished", 5, 3],
  ["gantt", "act", "Scheduler timeline", "Slot occupancy (monitor samples) and finished requests", 12, 3]]},
 {key: "perf", name: "Performance Analytics", icon: "trend", title: "Performance Analytics", sub: "Throughput, latency, efficiency and anomalies", rows: 4, tracks: "16fr 21.33fr 31.33fr 21.33fr", fit: true, cards: [
  ["pkpi", "trend", "Key indicators", "Last 50 requests vs the 50 before", 12, 1],
  ["prom", "db", "Prometheus totals", "Counters from /metrics/prometheus", 4, 2],
  ["lathist", "grid", "Duration distribution", "Finished requests per duration bucket", 4, 1],
  ["rings", "gauge", "GPU rings and efficiency", "Utilization per GPU, draft acceptance", 4, 1],
  ["compare", "grid", "Cache-reused vs fresh prompts", "Strata runs one engine; this splits its requests by prompt-cache reuse", 4, 1],
  ["sla", "shield", "SLA", "Uptime, readiness and error rate", 4, 1],
  ["dualc", "trend", "Throughput vs latency", "Decode tok/s and request duration (dual axis)", 6, 1],
  ["anomaly", "act", "Anomaly detection", "Live tok/s with 2σ outliers and a linear forecast", 6, 1]]},
 {key: "config", name: "Strata Config", icon: "gear", title: "Strata Configuration", sub: "Display only: packs, MTP, sampling, context, cache, APIs and the gaps. Changes are made on Control & Health and Chat, each confirmed", rows: 6, fit: true, cards: [
  ["packs", "layers", "Packs & engine", "Active pack, installed packs, engine settings", 4, 3], ["mtp", "bolt", "MTP / speculation", "Draft settings and acceptance", 4, 3],
  ["sampling", "gear", "Sampling & reasoning", "Defaults and live reasoning state", 4, 3], ["apis", "plug", "APIs & lifecycle", "Dialects, structured output, auto-load, idle unload", 4, 3],
  ["cache", "db", "Conversation cache", "Parks, restores, reuse", 4, 3], ["misc", "grid", "Timings, offload, MCP, replicas, slots", "Last request and server extras", 4, 3]]},
 {key: "control", name: "Control & Health", icon: "shield", title: "Control & Health", sub: "Health, model settings, load/unload, VRAM, slots and the API request log", rows: 6, fit: true, cards: [
  ["health", "shield", "Health", "GET /health and /v1/status", 3, 3], ["lifecycle", "plug", "Model lifecycle", "Load, unload and the VRAM reserve (confirmed)", 3, 3],
  ["runcfg", "gear", "Model settings", "Every run-config key Strata exposes (POST /config)", 6, 6], ["slotsc", "db", "Slots", "Save / restore a conversation slot (confirmed)", 3, 3],
  ["apilog", "list", "API request log", "Strata's request monitor (/api/requests)", 3, 3]]},
 {key: "diag", name: "Diagnostics", icon: "stetho", title: "Diagnostics", sub: "Run Strata's PC check, describe the behavior, preview and report", rows: 6, fit: true, cards: [
  ["diagrun", "stetho", "Run diagnostics", "Strata's own check (setup.py --check) plus a live snapshot", 6, 6], ["report", "bell", "Report to Strata", "Describe the behavior; preview before anything leaves this PC", 6, 6]]}
];
var RANGES = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["24h", 86400]];

function buildChrome() {
  $("#nav").innerHTML = PAGES.map(function (p, i) { return '<a data-p="' + i + '">' + ic(p.icon) + p.name + "<kbd>" + (i + 1) + "</kbd></a>"; }).join("");
  $("#tabs").innerHTML = PAGES.map(function (p, i) { return '<a data-p="' + i + '">' + (i + 1) + " " + p.name.split(" ")[0] + "</a>"; }).join("");
  document.querySelectorAll("[data-p]").forEach(function (a) { a.onclick = function () { go(+a.dataset.p); }; });
  $("#range").innerHTML = RANGES.map(function (r) { return '<button data-r="' + r[1] + '">' + r[0] + "</button>"; }).join("");
  $("#range").onclick = function (e) { if (e.target.dataset.r) { UI.range = +e.target.dataset.r; render(); } };
  $("#copy").onclick = function () { copyText($("#ep").textContent, this); };
  $("#kebab").onclick = function () { $("#menu").classList.toggle("open"); };
  $("#menu").onclick = function (e) { var a = e.target.dataset.act; $("#menu").classList.remove("open");
    if (a === "pause") UI.paused = !UI.paused; if (a === "diag") { go(PAGES.length - 1); runDiag(); }

    if (a === "export") { var b = new Blob([JSON.stringify(D, null, 1)], {type: "application/json"}); var u = URL.createObjectURL(b); var l = document.createElement("a"); l.href = u; l.download = "strata-snapshot.json"; l.click(); } };
  $("#search").oninput = function () { var q = this.value.toLowerCase(); document.querySelectorAll(".card").forEach(function (c) { c.classList.toggle("hide", q && c.textContent.toLowerCase().indexOf(q) < 0); }); };
  $("#bell").onclick = function () { if (!UI.alerts.length) return modal("Alerts", "No alerts."); pagedPopup("Alerts", '<div class="alerts">' + UI.alerts.map(alertHtml).join("") + "</div>"); };
  $("#mclose").onclick = function () { $("#modal").classList.remove("open"); };
  document.addEventListener("keydown", function (e) { if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return; var k = +e.key; if (k >= 1 && k <= PAGES.length) go(k - 1); });
  get("themes.json").then(function (t) { THEMES = t.themes || []; var sel = $("#theme");
    sel.innerHTML = ["dark", "light"].map(function (m) { return '<optgroup label="' + m + '">' + THEMES.filter(function (x) { return x.mode === m; }).map(function (x) { return '<option value="' + x.id + '">' + esc(x.title) + "</option>"; }).join("") + "</optgroup>"; }).join("");
    sel.onchange = function () { setTheme(sel.value); };
    $("#lightdark").onclick = function () { var cur = THEMES.filter(function (x) { return x.id === sel.value; })[0] || {}; var want = cur.mode === "light" ? "dark" : "light";
      var twin = THEMES.filter(function (x) { return x.mode === want && cur.id && x.id.replace(/-(light|dark)$/, "") === cur.id.replace(/-(light|dark)$/, ""); })[0] || THEMES.filter(function (x) { return x.mode === want; })[0]; if (twin) setTheme(twin.id); };
    setTheme(localStorage.getItem("sm.theme") || "cybernetic-stallion-dark"); }, function () { $("#theme").innerHTML = "<option>themes unavailable</option>"; });
  var h = (location.hash || "").replace("#", ""); PAGES.forEach(function (p, i) { if (p.key === h) UI.page = i; });
}
var THEMES = [];
function setTheme(id) { var t = THEMES.filter(function (x) { return x.id === id; })[0] || THEMES[0]; if (!t) return; C.theme(t.tokens); $("#theme").value = t.id;
  document.body.classList.toggle("lightmode", t.mode === "light"); localStorage.setItem("sm.theme", t.id); document.querySelectorAll(".card .cb").forEach(function (b) { delete b.dataset.drawn; }); render(); }
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("#modal").classList.contains("open")) $("#modal").classList.remove("open"); });  /* Escape closes the popup (cancel) */
function copyText(t, btn) {  /* clipboard can be refused (no permission / not a secure context): fall back to a selection copy, and say so */
  var old = btn.textContent, done = function (ok) { btn.textContent = ok ? "✓" : "✕"; btn.title = ok ? "Copied" : "Copy blocked by the browser — select and copy by hand"; setTimeout(function () { btn.textContent = old; }, 1200); };
  var fb = function () { var a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} a.remove(); done(ok); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, fb); else fb(); }
function modal(t, html) { $("#mbody").classList.remove("paged"); $("#mtitle").textContent = t; $("#mbody").innerHTML = html; $("#modal").classList.add("open"); }
function go(i) { UI.page = i; location.hash = PAGES[i].key; layout(); render(); }

var STRIP = {fleetkpi: 1, pkpi: 1, pipeline: 1};
function layout() {
  var p = PAGES[UI.page];
  document.querySelectorAll("[data-p]").forEach(function (a) { a.classList.toggle("on", +a.dataset.p === UI.page); });
  $("#ptitle").textContent = p.title; $("#psub").textContent = p.sub;
  var g = $("#grid"); g.style.gridTemplateColumns = "repeat(12,minmax(0,1fr))";
  // rows fill the window; cards with row span 0 share the remaining space
  var used = p.cards.reduce(function (a, c) { return a; }, 0); void used;
  g.style.gridAutoRows = p.fit ? "" : "minmax(" + (p.rowMin || (p.key === "diag" ? 60 : 64)) + "px,1fr)";
  g.style.gridTemplateRows = p.fit ? p.tracks || "repeat(" + p.rows + ",minmax(0,1fr))" : ""; g.style.overflow = p.fit ? "hidden" : "";
  g.innerHTML = p.cards.map(function (c) { var rs = c[5] || 1;
    var strip = STRIP[c[0]];  /* KPI strips: no header row; the icon sits left of the tiles and carries the title as its tooltip */
    return '<div class="card' + (strip ? " strip" : "") + " s" + c[4] + '" id="c-' + c[0] + '" style="grid-column:span ' + c[4] + ';grid-row:span ' + rs + ";--refn:" + (c[4] * 94 - 47) + '"><div class="ch"><div class="ic"' + (strip ? ' title="' + esc(c[2] + " — " + c[3]) + '"' : "") + ">" + ic(c[1]) + '</div><div><h3 title="' + esc(c[2] + " — " + c[3]) + '">' + c[2] + '</h3><p title="' + esc(c[3]) + '">' + c[3] +
      '</p></div><div class="act" id="a-' + c[0] + '"></div></div><div class="cb" id="b-' + c[0] + '"></div></div>'; }).join("");
}
function B(id) { return $("#b-" + id); }
function A(id) { return $("#a-" + id); }

/* ---------- data ---------- */
function get(path) { return fetch(path, {cache: "no-store"}).then(function (r) { if (!r.ok) throw new Error(r.status); return path.indexOf("prometheus") >= 0 ? r.text() : r.json(); }); }
function poll() {
  if (UI.paused) return;
  Promise.allSettled([get("/strata/metrics"), get("/strata/v1/status"), get("/strata/status"), get("/strata/slots"), get("/monitor/history?n=2000")]).then(function (r) {
    D.m = r[0].value || null; D.vs = r[1].value || null; D.st = r[2].value || null; D.slots = r[3].value || null; D.hist = (r[4].value || {}).samples || D.hist;
    D.err = r[0].status === "rejected" ? String(r[0].reason) : null; if (D.m) D.at = D.m.time || Date.now() / 1000;
    derive(); render();
  });
}
function pollSlow() {
  get("/monitor/gpu").then(function (g) { D.gpu = g; }, function () { D.gpu = null; });
  Promise.allSettled([get("/strata/config"), get("/strata/props"), get("/strata/mcp"), get("/strata/metrics/prometheus"), get("/strata/health"), get("/monitor/info"), get("/strata/settings")]).then(function (r) {
    D.cfg = r[0].value || null; D.props = r[1].value || null; D.mcp = r[2].value || null; D.prom = r[3].value || null; D.health = r[4].value || null; D.info = r[5].value || null; D.settings = r[6].value || null; render();
  });
}
function hw() { return (D.m && D.m.hardware) || {}; }
function gpus() { return hw().gpus || []; }
function drv(i) { return ((D.gpu || {}).gpus || []).filter(function (x) { return x.index === i; })[0] || null; }
function gname(g, i) { var d = drv(g.index); if (d && d.name) return d.name; var n = (((D.m || {}).hardware_static || {}).gpu_name || "").split(" + "); return n.length === gpus().length ? n[i] : null; }
function glimit(g) { var d = drv(g.index); return d && ok(d.power_limit) ? d.power_limit : null; }
function totLimit() { var h = hw(); if (ok(h.gpu_power_limit)) return h.gpu_power_limit; var G = gpus(), l = G.map(glimit); return l.length && l.every(ok) ? l.reduce(function (a, x) { return a + x; }, 0) : null; }
function totPowerSeries(rs) { return col(rs, function (s) { var g = s.gpus || []; return g.length && g.every(function (x) { return ok(x.power); }) ? g.reduce(function (a, x) { return a + x.power; }, 0) : null; }); }
/* headline: total power of all GPUs against the combined limit */
function powerHero(el, rs, big) { var h = hw(), tot = h.gpu_power, lim = totLimit(), many = gpus().length > 2, lims = gpus().map(glimit), sameLim = lims.length && lims.every(function (x) { return ok(x) && x === lims[0]; });
  el.innerHTML = '<div class="phero' + (el.clientWidth && el.clientWidth < 600 ? " narrow" : "") + (el.clientHeight && el.clientHeight < 140 && narrowCard(el.closest(".card")) ? " short" : "") + '"><div class="phero-ring" id="' + el.id + 'r"></div><div class="phero-t" data-fit="52" data-min="14"><div class="fit-in"><small>TOTAL GPU POWER</small><b>' + v(tot, function (x) { return Math.round(x); }) + '<em> W</em></b><span>of ' + v(lim, function (x) { return Math.round(x) + " W"; }) + " combined limit · " + gpus().length + " GPU" + (gpus().length === 1 ? "" : "s") +
    (many && sameLim ? " · " + Math.round(lims[0]) + " W each" : "") + '</span><div class="phero-cards' + (many ? " many" : "") + '">' + (many && el.id === "b-opower" ? [] : gpus()).map(function (g) { var l = glimit(g); return "<i>" + (many ? "<small>GPU " + g.index + "</small> " : "GPU " + g.index + " ") + v(g.power, function (x) { return Math.round(x) + " W"; }) + (ok(l) && !(many && sameLim) ? " / " + Math.round(l) + " W" : "") + "</i>"; }).join("") + '</div></div></div><div class="phero-h" id="' + el.id + 'h"></div></div>';
  C.ring($("#" + el.id + "r"), {value: tot, max: lim, label: ok(tot) && ok(lim) ? Math.round(tot / lim * 100) + "%" : null, sub: "of limit", title: "total GPU power"});
  C.area($("#" + el.id + "h"), {yaxis: false, time: TW(rs), series: [{label: "total W", data: bucket(totPowerSeries(rs), 160), color: "warning"}], legend: false, min: 0, max: ok(lim) ? lim : null, unit: " W", title: "total GPU power history", empty: "collecting history…"}); }
function live() { return (D.m && D.m.live) || {}; }
function reqs() { return ((D.m && D.m.requests) || []).slice().sort(function (a, b) { return a.time - b.time; }); }
function TW(rs) { var ok2 = rs.filter(function (x) { return x.t; }); return ok2.length > 1 ? {t0: ok2[0].t, t1: ok2[ok2.length - 1].t, now: Date.now() / 1000} : null; }
function hwin() { var t = Date.now() / 1000 - UI.range; return D.hist.filter(function (s) { return s.t >= t; }); }
function col(rows, f) { return rows.map(function (s) { return s.ok ? f(s) : null; }); }

function derive() {
  var L = live(), now = Date.now() / 1000;
  var ph = L.phase || (D.st && D.st.phase); if (ph && ph !== UI.lastPhase) { push(now, "phase", ph); UI.lastPhase = ph; }
  reqs().forEach(function (q) { var k = q.time + ":" + q.output_tokens; if (!UI.seenReq[k]) { UI.seenReq[k] = 1;
    if (now - q.time < 600) push(q.time, q.finish === "stop" ? "done" : "finish", "finished (" + q.finish + "), " + q.output_tokens + " tokens, " + n1(q.duration_s) + "s"); } });
  if (D.err) push(now, "error", "Strata unreachable: " + D.err);
  // alerts
  var A2 = [];
  gpus().forEach(function (g) { if (ok(g.temp) && g.temp >= 85) A2.push(["crit", "GPU " + g.index + " at " + g.temp + "°C"]); else if (ok(g.temp) && g.temp >= 78) A2.push(["warn", "GPU " + g.index + " warm: " + g.temp + "°C"]);
    var p = pct(g.mem_used, g.mem_total); if (p != null && p > 97) A2.push(["warn", "GPU " + g.index + " VRAM " + p.toFixed(1) + "% used"]); });
  var h = hw(); if (ok(h.gpu_pcie_width) && ok(h.gpu_pcie_gen_max) && h.gpu_pcie_width < 16) A2.push(["info", "PCIe link x" + h.gpu_pcie_width + " (gen " + h.gpu_pcie_gen + ")"]);
  var rp = pct(h.ram_used, h.ram_total); if (rp != null && rp > 90) A2.push(["warn", "RAM pressure " + rp.toFixed(0) + "%"]);
  if (D.err) A2.push(["crit", "Strata unreachable"]); if (ok(L.waiting) && L.waiting > 0) A2.push(["warn", L.waiting + " request(s) waiting for a slot"]);
  if (!A2.length) A2.push(["ok", "All readings nominal"]);
  UI.alerts = A2; $("#bellc").textContent = A2.filter(function (a) { return a[0] !== "ok"; }).length;
}
function push(t, kind, text) { if (UI.feedPaused) return; UI.events.unshift({t: t, kind: kind, text: text}); UI.events.sort(function (a, b) { return b.t - a.t; }); UI.events.length = Math.min(UI.events.length, 200); }
function alertHtml(a) { return '<div class="alert ' + a[0] + '"><span class="st ' + a[0] + '">' + a[0] + "</span>" + esc(a[1]) + "</div>"; }

/* ---------- chrome render ---------- */
function sideTps(up) { var el = $("#tps"); if (!el) return; var L = live(), vs = D.vs || {};
  /* same sources as Request Flow > Active requests: per-slot tok_s from /metrics live.slots; a request outside slots uses live.tok_s */
  var now = Date.now() / 1000, PG = sideTps.g || (sideTps.g = {}), seen = {};
  var rows = (L.slots || []).filter(function (s) { return s.state && s.state !== "idle"; }).map(function (s) { seen[s.slot] = 1;
    var g = PG[s.slot], r = null; if (s.state === "decoding" && ok(s.generated)) { if (g && g.gen <= s.generated && now - g.t >= 1) { r = (s.generated - g.gen) / (now - g.t); g.r = g.r == null ? r : g.r * .5 + r * .5; PG[s.slot] = {gen: s.generated, t: now, r: g.r}; r = g.r; } else if (g && g.gen <= s.generated) r = g.r; else PG[s.slot] = {gen: s.generated, t: now, r: null}; } else delete PG[s.slot];
    return {name: "slot " + s.slot, tps: s.state === "decoding" ? r : null, note: s.state === "decoding" ? (ok(s.generated) ? s.generated.toLocaleString() + " tok" : "decoding") : "reading prompt"}; });
  if (!rows.length && (L.state === "generating" || L.state === "reading")) rows.push({name: (L.outside_slots ? "request" : "request"), tps: L.state === "generating" && ok(L.tok_s) ? L.tok_s : null, note: L.state === "generating" ? (ok(L.generated) ? L.generated.toLocaleString() + " tok" : "decoding") : "reading prompt"});
  Object.keys(PG).forEach(function (k) { if (!seen[k]) delete PG[k]; });
  var known = rows.filter(function (r) { return r.tps != null; }), dec = rows.some(function (r) { return r.note !== "reading prompt"; });
  /* total = Strata's own windowed aggregate decode rate (live.tok_s), the same number as Performance > Decode tok/s */
  var total = L.state === "generating" && ok(L.tok_s) ? L.tok_s : dec && known.length ? known.reduce(function (s, r) { return s + r.tps; }, 0) : null;
  var state = !up ? "unavailable" : vs.loaded === false ? "model not loaded" : rows.length ? (known.length ? rows.length + " stream" + (rows.length > 1 ? "s" : "") : "reading prompt") : "idle";
  var big = !up ? "—" : total != null ? (total >= 100 ? Math.round(total) : total.toFixed(1)) : rows.length ? "…" : "0";
  el.className = "tps" + (total ? " on" : "");
  el.innerHTML = '<small>TOKENS / SEC</small><div class="tps-h" data-fit="58" data-min="20"><div class="fit-in"><b>' + big + "</b></div></div><span class='tps-s'>" + state + "</span>" +
    '<div class="tps-r">' + rows.map(function (r) { return "<div><span>" + esc(r.name) + "</span><em>" + esc(r.note) + "</em><b>" + (r.tps != null ? n1(r.tps) : "<i class='na'>—</i>") + "</b></div>"; }).join("") + "</div>";
  fitOne(el.querySelector(".tps-h"));
  var box = el.querySelector(".tps-r"), list = [].slice.call(box.children), hid = 0;  /* rows that do not fit collapse into one plain count line */
  while (list.length > 1 && box.scrollHeight > box.clientHeight + 1) { list.pop().remove(); hid++; }
  if (hid) { var m = document.createElement("div"); m.className = "tps-more"; m.textContent = "+" + hid + " more stream" + (hid > 1 ? "s" : "") + " (Request Flow)"; box.appendChild(m); if (box.scrollHeight > box.clientHeight + 1 && box.children.length > 2) { box.children[box.children.length - 2].remove(); m.textContent = "+" + (hid + 1) + " more streams (Request Flow)"; } } }
function chrome() {
  var up = !!D.m && !D.err, vs = D.vs || {}; sideTps(up);
  $("#livepill").className = "pill " + (up ? "live" : "off"); $("#livepill").innerHTML = "<i></i>" + (UI.paused ? "PAUSED" : up ? "LIVE" : "OFFLINE");
  $("#ep").textContent = (D.info && D.info.strata) || "unavailable"; $("#uptime").innerHTML = v(vs.uptime_s, dur);
  $("#sysdot").className = up ? "ok" : "bad"; $("#systxt").textContent = up ? (UI.alerts.some(function (a) { return a[0] === "crit"; }) ? "Attention needed" : "All Systems Operational") : "Strata unreachable";
  $("#sysver").textContent = vs.engine ? "Strata " + vs.engine : "Strata version unavailable";
  $("#env").innerHTML = '<option>' + ((D.info && D.info.strata) ? "Local · " + D.info.strata.replace(/^https?:\/\//, "") : "Local") + "</option>";
  document.querySelectorAll("#range button").forEach(function (b) { b.classList.toggle("on", +b.dataset.r === UI.range); });
  $("#age").textContent = D.at ? ago(D.at) : "—"; $("#stripdot").className = "dot " + (up ? "ok" : "bad"); $("#striplive").textContent = up ? "Live" : "Offline";
}

/* ---------- widgets per card ---------- */
var R = {};
function lastReq() { var q = reqs(); return q[q.length - 1] || null; }
function lastRead() { var L = live(), r = lastReq();  /* Strata fills prompt_read/prompt_total only while a prompt is read, after its first chunk */
  if (L.state === "reading") return "<span class='na'>starting (" + v(L.prompt_tokens, function (x) { return x.toLocaleString(); }) + " tokens)</span>";
  return r && ok(r.prompt_read) && ok(r.prompt_total) ? "last request: " + r.prompt_read.toLocaleString() + " of " + r.prompt_total.toLocaleString() + " read" + (ok(r.reused) ? " · " + r.reused.toLocaleString() + " reused" : "") : NA; }
R.serving = function (b) { var L = live(), vs = D.vs || {}, h = D.health || {}; var read = L.prompt_read, tot = L.prompt_total, f = ok(read) && ok(tot) && tot > 0 ? read / tot : null;
  var segs = ""; for (var i = 0; i < 24; i++) segs += "<i class='" + (f != null && i < f * 24 ? "f" : "") + "'></i>";
  A("serving").innerHTML = '<span class="st ' + (vs.loaded ? "ready" : "idle") + '">' + (vs.loaded ? "READY" : vs.loaded === false ? "NOT LOADED" : "UNKNOWN") + "</span>";
  b.innerHTML = '<div class="kv"><span>Model</span><b>' + v(vs.model || h.model) + "</b><span>State</span><b>" + v(L.state) + " · " + v(L.phase) +
    "</b><span>In flight</span><b>" + v((vs.activity || {}).in_flight) + "</b><span>Queue</span><b>" + v(L.queued) + " engine / " + v(L.waiting) + " pre-admit / " + v(L.admitting) + " admitting" +
    '</b><span>Read</span><b style="display:flex;gap:8px;align-items:center"><span class="prog">' + segs + "</span>" + (f != null ? Math.round(f * 100) + "% (" + read.toLocaleString() + " / " + tot.toLocaleString() + ")" : lastRead()) +
    "</b><span>Prompt</span><b>" + v(L.prompt_tokens, function (x) { return x.toLocaleString() + " tokens"; }) + "</b><span>Generated</span><b>" + v(L.generated) + " / " + v(L.max_tokens) + " max</b><span>Elapsed</span><b>" + v(L.elapsed_s, function (x) { return n1(x) + "s"; }) + "</b></div>"; };
R.perf = function (b) { var rs = hwin(), L = live(), q = reqs(), last = q[q.length - 1] || {}, lt = (D.vs || {}).last_timings || {};
  var notGen = L.state && L.state !== "generating" && slotTokS(L) == null ? "<span class='na'>" + L.state + "</span>" : null;
  var items = [["Answer (live)", ok(L.tok_s) ? L.tok_s : slotTokS(L), col(rs, function (s) { return s.tok_s; }), "#34d399"], ["Prompt read", L.prefill_tok_s_mean, col(rs, function (s) { return s.prefill; }), "#60a5fa"],
    ["Decode (last req)", lt.predicted_per_second, q.slice(-40).map(function (r) { return r.decode_tok_s; }), "#a78bfa"], ["Output (mean)", ok(L.tok_s_mean) ? L.tok_s_mean : null, q.slice(-40).map(function (r) { return r.output_tokens / Math.max(.001, r.duration_s); }), "#22d3ee"]];
  b.innerHTML = '<div class="kpis">' + items.map(function (x, i) { var live0 = i === 0 || i === 3; return '<div class="kpi"><small>' + x[0] + "</small><b>" + (!ok(x[1]) && live0 && (notGen || L.state === "reading") ? (notGen || "<span class='na'>reading</span>") : v(x[1], n1) + "<em>tok/s</em>") + "</b><div class='sp' id='ps" + i + "'></div></div>"; }).join("") + "</div>";
  items.forEach(function (x, i) { C.spark($("#ps" + i), {data: x[2], color: x[3], min: 0}); }); void last; };
/* effective per-slot state: Strata's live.slots, plus /slots is_processing, Any active slot (reading, prefill, decoding, processing) is busy.
   A request Strata runs outside the batch slots (live.outside_slots) is NOT drawn as a slot block; it is shown in the Outside slots row. */
function slotView(L) { var raw = L.slots || [], ps = Array.isArray(D.slots) ? D.slots : [], byId = {};
  ps.forEach(function (p) { byId[p.id] = p; });
  var sl = raw.map(function (s) { var st = s.state || "idle", p = byId[s.slot]; if (st === "idle" && p && p.is_processing) st = "processing"; return {slot: s.slot, state: st, held_tokens: s.held_tokens}; });
  if (!sl.length && ps.length) sl = ps.map(function (p) { return {slot: p.id, state: p.is_processing ? "processing" : "idle", held_tokens: p.n_prompt_tokens}; });
  return sl; }
R.batching = function (b) { var L = live(), e = (D.m || {}).engine || {}, sl = slotView(L); var cnt = {idle: 0, reading: 0, decoding: 0, processing: 0};
  sl.forEach(function (s) { cnt[s.state] = (cnt[s.state] || 0) + 1; }); var groups = e.batch_groups, per = groups ? Math.ceil(sl.length / groups) : null;
  var chips = ""; if (groups && sl.length) for (var g = 0; g < groups; g++) { var part = sl.slice(g * per, (g + 1) * per), busy = part.filter(function (s) { return s.state !== "idle"; }).length;
    chips += '<div class="chip">G' + g + " " + busy + "/" + part.length + " " + part.map(function (s) { return "<i class='" + (s.state !== "idle" ? "f" : "") + "'></i>"; }).join("") + '<span class="gfill"><b style="width:' + (part.length ? busy / part.length * 100 : 0) + '%"></b></span></div>'; }
  b.innerHTML = '<div class="batg"><div><div class="kv"><span>Slots busy</span><b>' + (sl.length ? (sl.length - (cnt.idle || 0)) : v(L.running)) + " / " + v(L.parallel) + (L.outside_slots ? " · +" + L.outside_slots + " outside slots" : "") +
    "</b><span>Groups</span><b>" + v(groups) + "</b><span>Batch rows</span><b>" + (sl.length ? (sl.length - (cnt.idle || 0)) + " active of " + sl.length : NA) + "</b><span>Batch slots</span><b>" + v(e.batch_slots) + "</b><span>Outside slots</span><b>" + v(L.outside_slots) + "</b><span>Pre-admit</span><b>" + v(L.waiting) +
    " waiting · oldest wait " + NA + "</b><span>Phases</span><b>read " + (cnt.reading || 0) + " · decode " + (cnt.decoding || 0) + (cnt.processing ? " · busy " + cnt.processing : "") + " · idle " + (cnt.idle || 0) + "</b><span>Held tokens</span><b>" +
    sl.reduce(function (a, s) { return a + (s.held_tokens || 0); }, 0).toLocaleString() + '</b></div></div><div class="batr"><div class="stack3d">' + cube(sl) + '</div><div class="chips">' + (chips || NA) + "</div></div></div>"; };
function cube(sl) { if (!sl.length) return NA; var s = '<svg viewBox="-6 4 116 98" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="overflow:visible">', n = sl.length, cols = Math.ceil(Math.sqrt(n));
  sl.forEach(function (x, i) { var cx = i % cols, cy = Math.floor(i / cols), X = 30 + cx * 22 - cy * 14, Y = 70 - cx * 8 - cy * 10 + (x.state === "idle" ? 0 : -14);
    var c = C.color(x.state === "decoding" ? "success" : (x.state === "reading" || x.state === "prefill") ? "series3" : x.state === "idle" ? "accent" : "warn");
    s += '<g opacity="' + (x.state === "idle" ? .42 : 1) + '" style="filter:drop-shadow(0 0 ' + (x.state === "idle" ? 2 : 7) + 'px ' + c + ')"><path d="M' + X + " " + Y + "l14 -7 14 7 -14 7z\" fill=\"" + c + '" opacity=".9"/><path d="M' + X + " " + Y + "v16l14 7v-16z\" fill=\"" + c + '" opacity=".6"/><path d="M' + (X + 28) + " " + Y + "v16l-14 7v-16z\" fill=\"" + c + '" opacity=".4"/></g>'; });
  return s + "</svg>"; }
R.hardware = function (b) { var h = hw(), hs = (D.m || {}).hardware_static || {}, G = gpus(); A("hardware").innerHTML = '<small style="color:var(--mu)">' + v(hs.gpu_count, function (n) { return n + " GPU" + (n > 1 ? "s" : ""); }) + "</small>";
  var names = (hs.gpu_name || "").split(" + "); b.dataset.nofit = 1; b.className = "cb hwbox";  /* GPU rows + the three pressure bars always on the card; no More / popup */
  b.innerHTML = '<table><tr><th>GPU</th><th>Model</th><th>VRAM</th><th>Temp</th><th>Power</th><th>Util</th></tr>' + (G.length ? G.map(function (g, i) {
    return "<tr><td>GPU " + g.index + '<small class="hwu2">' + v(g.util, function (u) { return u + "% util"; }) + "</small></td><td>" + (gname(g, i) ? esc(gname(g, i).replace(/NVIDIA GeForce |AMD Radeon /, "")) : NA) + "</td><td data-l=\"VRAM\">" + (ok(g.mem_used) ? gb(g.mem_used) + " / " + gb(g.mem_total) + " GiB" : NA) + "</td><td data-l=\"Temp\">" + v(g.temp, function (t) { return t + "°C"; }) +
      "</td><td data-l=\"Power\">" + v(g.power, function (p) { return Math.round(p) + " W"; }) + '</td><td class="hwu"><div id="hr' + i + '" class="hwring"></div></td></tr>'; }).join("") : '<tr><td colspan="6">' + NA + "</td></tr>") +
    '</table><div class="hwp"><small>CPU, RAM and VRAM pressure</small><div class="w-bars" id="hwb"></div></div>';
  if (G.length > 2) hwCompact(b, h, hs, G); else b.hwFit = null;
  C.bars($("#hwb"), {items: [{label: "CPU", value: h.cpu, max: 100, text: ok(h.cpu) ? h.cpu + "%" : null}, {label: "RAM", value: h.ram_used, max: h.ram_total, text: ok(h.ram_used) ? gb(h.ram_used) + " / " + gb(h.ram_total) + " GiB" : null, color: "#a78bfa"},
    {label: "VRAM", value: h.gpu_mem_used, max: h.gpu_mem_total, text: ok(h.gpu_mem_used) ? gb(h.gpu_mem_used) + " / " + gb(h.gpu_mem_total) + " GiB" : null, color: "#f472b6"}]});
  if (b.hwFit) b.hwFit();
  G.forEach(function (g, i) { C.ring($("#hr" + i), {value: g.util, max: 100, title: "GPU " + g.index + " utilization"}); }); };
function hwCompact(b, h, hs, G) { var nm = (gname(G[0], 0) || "").replace(/NVIDIA GeForce |AMD Radeon /, ""), same = G.every(function (g, i) { return (gname(g, i) || "").replace(/NVIDIA GeForce |AMD Radeon /, "") === nm; });
  A("hardware").innerHTML = '<small style="color:var(--mu)">' + (same && nm ? G.length + "× " + esc(nm) : G.length + " GPUs") + "</small>";
  var row = function (g, i) { return "<tr><td>GPU " + g.index + "</td>" + (same ? "" : "<td>" + esc(gname(g, i) || "") + "</td>") + "<td>" + (ok(g.mem_used) ? gb(g.mem_used) + " / " + gb(g.mem_total) : NA) + "</td><td>" + v(g.temp, function (t) { return t + "°C"; }) + "</td><td>" + v(g.power, function (p) { return Math.round(p) + " W"; }) + '</td><td class="hwu"><div id="hr' + i + '" class="hwring"></div></td></tr>'; };
  var head = "<tr><th>GPU</th>" + (same ? "" : "<th>Model</th>") + "<th>VRAM GiB</th><th>Temp</th><th>Power</th><th>Util</th></tr>";
  var bars = '<div class="hwp"><small>CPU, RAM and VRAM pressure</small><div class="w-bars" id="hwb"></div></div>';
  b.classList.add("hwmany"); b.innerHTML = '<div class="hwt"><table>' + head + G.map(row).join("") + "</table></div>" + bars;
  b.hwFit = function () { var hp = b.querySelector(".hwp"), avail = b.clientHeight - (hp ? hp.offsetHeight : 92) - 8, rh = avail / (G.length + 1);
    if (rh < 22) { var half = Math.ceil(G.length / 2), short = function (g, i) { return "<tr><td>" + g.index + "</td><td>" + v(g.temp, function (t) { return t + "°"; }) + "</td><td>" + v(g.power, function (p) { return Math.round(p) + "W"; }) + '</td><td class="hwu"><div id="hr' + i + '" class="hwring"></div></td></tr>'; },
        sh = "<tr><th>GPU</th><th>Temp</th><th>Power</th><th>Util</th></tr>"; b.classList.add("hwsplit"); rh = avail / (half + 1);
      b.querySelector(".hwt").innerHTML = "<table>" + sh + G.slice(0, half).map(function (g, i) { return short(g, i); }).join("") + "</table><table>" + sh + G.slice(half).map(function (g, i) { return short(g, i + half); }).join("") + "</table>"; }
    b.style.setProperty("--hr", Math.max(14, Math.min(30, rh - 4)) + "px"); }; }
function slotRows() { var L = live(); return (L.slots || []).filter(function (s) { return s.state !== "idle"; }).map(function (s) {
  /* busy slots carry prompt_tokens / generated / elapsed_s / tok_s; only idle slots carry held_tokens */
  return {id: "s" + s.slot, state: s.state, slot: s.slot, tokens: s.state === "decoding" ? s.generated : ok(s.prompt_tokens) ? s.prompt_tokens : s.held_tokens,
    detail: (s.state === "reading" ? "reading " + v(s.prompt_tokens, function (x) { return x.toLocaleString(); }) + "-token prompt" : "generating" + (ok(s.tok_s) ? " @ " + n1(s.tok_s) + " tok/s" : "")) + (ok(s.elapsed_s) ? " · " + n1(s.elapsed_s) + "s" : ""), age: s.elapsed_s}; }); }
function slotTokS(L) { var d = (L.slots || []).filter(function (s) { return s.state === "decoding" && ok(s.tok_s); }); return d.length ? d.reduce(function (a, s) { return a + s.tok_s; }, 0) : null; }
R.requests = function (b) { var rows = slotRows(), L = live(), done = reqs().slice(-30).reverse();
  if (ok(L.queued) && L.queued > 0) rows.push({id: "queue", state: "queued", slot: null, tokens: "—", detail: L.queued + " in engine queue"});
  if (ok(L.waiting) && L.waiting > 0) rows.push({id: "pre-admit", state: "waiting", slot: null, tokens: "—", detail: L.waiting + " waiting"});
  if (!rows.length && L.state === "generating") rows.push({id: "r", state: "decode", slot: null, tokens: L.generated, detail: L.phase});
  var all = rows.map(function (r) { return "<tr><td>" + r.id + '</td><td><span class="st ' + r.state + '">' + r.state + "</span></td><td>" + esc(r.detail || "") + "</td><td>" + v(r.tokens) + "</td><td>live</td></tr>"; })
    .concat(done.map(function (q) { return "<tr><td>done</td><td><span class='st " + q.finish + "'>" + q.finish + "</span></td><td>" + q.prompt_tokens.toLocaleString() + " in · " + q.output_tokens + " out · hit " + Math.round(q.hit_rate * 100) + "%</td><td>" + q.output_tokens + "</td><td>" + ago(q.time) + "</td></tr>"; }));
  b.className = "cb";  /* every row; the card shows what fits and its header icon opens the full list */
  b.innerHTML = "<table><tr><th>ID</th><th>State</th><th>Details</th><th>Tokens</th><th>Age</th></tr>" + (all.length ? all.join("") : "<tr><td colspan='5'><span class='na'>no requests yet</span></td></tr>") + "</table>"; };
R.activity = function (b) { A("activity").innerHTML = '<select class="f" id="ff" style="width:110px;padding:3px"><option value="all">All events</option><option value="phase">Phases</option><option value="done">Finished</option><option value="error">Errors</option></select><button class="btn sm sec" id="fp">' + (UI.feedPaused ? "▶" : "❚❚") + "</button>";
  $("#ff").value = UI.feedFilter; $("#ff").onchange = function () { UI.feedFilter = this.value; render(); }; $("#fp").onclick = function () { UI.feedPaused = !UI.feedPaused; render(); };
  var ev = UI.events.filter(function (e) { return UI.feedFilter === "all" || e.kind === UI.feedFilter || (UI.feedFilter === "done" && e.kind === "finish"); }).slice(0, 40);
  b.className = "cb scroll"; b.innerHTML = ev.length ? '<ul class="feed">' + ev.map(function (e) { return "<li><time>-" + ago(e.t) + "</time><span>" + esc(e.text) + "</span></li>"; }).join("") + "</ul>" : C.unavailable(b, "no events yet") || b.innerHTML; };

/* fleet */
function gh(rows, i, k) { return col(rows, function (s) { var g = (s.gpus || [])[i]; return g ? g[k] : null; }); }
R.fleetkpi = function (b) { var G = gpus(), h = hw(), rs = hwin(), L = live(); var avg = h.gpu_util; var hot = G.filter(function (g) { return g.temp >= 85; }).length;
  var health = G.length ? (hot ? "Degraded" : "Healthy") : null;
  var k = [["Total GPUs", G.length || null, "", null], ["Cluster health", health, "", null], ["Active jobs", L.running, "", col(rs, function (s) { return s.running; })],
    ["Avg utilization", avg, "%", col(rs, function (s) { var g = s.gpus || []; return g.length ? g.reduce(function (a, x) { return a + (x.util || 0); }, 0) / g.length : null; })],
    ["Total VRAM", ok(h.gpu_mem_total) ? gb(h.gpu_mem_total) : null, " GiB", col(rs, function (s) { var g = s.gpus || []; return g.length && g.every(function (x) { return ok(x.mem_used); }) ? g.reduce(function (a, x) { return a + x.mem_used; }, 0) / 1073741824 : null; })],
    ["Total power", ok(h.gpu_power) ? Math.round(h.gpu_power) + (ok(totLimit()) ? " / " + Math.round(totLimit()) : "") : null, " W", totPowerSeries(rs)]];
  b.innerHTML = '<div class="kpis">' + k.map(function (x) { return '<div class="kpi" data-fit="40"><div class="fit-in"><small>' + x[0] + "</small><b>" + v(x[1]) + "<em>" + (ok(x[1]) ? x[2] : "") + "</em></b></div></div>"; }).join("") + "</div>"; };
R.fleetsum = function (b) { b.dataset.nofit = 1; R.fleetkpi(b); var k = b.firstChild; if (k) k.className = "kpis fsum"; };
R.gpucards = function (b) { var G = gpus(), rs = hwin();
  if (!G.length) return C.unavailable(b, "no GPU readings from Strata"); b.className = "cb";
  if (G.length > 2) return gpuCompact(b, G, rs);
  /* one tile per reading: the utilization ring sits in Utilization, the temperature dial in Temperature (no second copy) */
  b.innerHTML = '<div class="gpus">' + G.map(function (g, i) { var l = glimit(g), vp = pct(g.mem_used, g.mem_total), d = drv(g.index) || {};
    return '<div class="gpu"><h4>GPU ' + g.index + " <small>" + esc(gname(g, i) || "") + '</small></h4><div class="gstats">' +
      '<div class="gt" data-fit="24"><div class="fit-in"><small>Power</small><b>' + v(g.power, function (x) { return Math.round(x); }) + "<em> W</em></b><span>" + (ok(l) ? "of " + Math.round(l) + " W limit" + (ok(g.power) ? " · " + Math.round(g.power / l * 100) + "%" : "") : "limit " + NA) + "</span></div></div>" +
      '<div class="gt gg"><div class="gauge" id="gt' + i + '"></div><div class="gtx" data-fit="24"><div class="fit-in"><small>Temperature</small><b>' + v(g.temp) + "<em> °C</em></b><span>" + v(d.fan, function (f) { return "fan " + f + "%"; }) + (ok(d.mem_temp) ? " · mem " + d.mem_temp + " °C" : "") + "</span></div></div></div>" +
      '<div class="gt gg"><div class="gauge" id="gd' + i + '"></div><div class="gtx" data-fit="24"><div class="fit-in"><small>Utilization</small><b>' + v(g.util) + "<em> %</em></b><span>" + v(d.clock_sm, function (c) { return c + " MHz"; }) + "</span></div></div></div>" +
      '<div class="gt" data-fit="24"><div class="fit-in"><small>VRAM</small><b>' + (ok(g.mem_used) ? gb(g.mem_used) : NA) + "<em> GiB</em></b><span>" + (ok(g.mem_total) ? "of " + gb(g.mem_total) + " GiB · " + vp.toFixed(1) + "%" : NA) + "</span></div></div>" +
      '</div><div class="hist" id="gh' + i + '"></div></div>'; }).join("") + "</div>";
  G.forEach(function (g, i) { C.ring($("#gd" + i), {value: g.util, max: 100, label: ok(g.util) ? "" : null, title: "GPU " + g.index + " utilization"});
    C.dial($("#gt" + i), {value: g.temp, min: 20, max: 100, unit: "°C", label: "", title: "GPU " + g.index + " temperature"});
    var l = glimit(g);  /* history keeps the readings that move: utilization and power (as % of this card's limit); temperature and VRAM are near-flat and already shown above */
    C.area($("#gh" + i), {yaxis: false, time: TW(rs), series: [{label: "util %", data: gh(rs, i, "util"), color: "accent"},
      {label: ok(l) ? "power % of " + Math.round(l) + " W" : "power W", data: col(rs, function (s) { var x = (s.gpus || [])[i]; return x && ok(x.power) ? (ok(l) ? x.power / l * 100 : x.power) : null; }), color: "warning"}],
      min: 0, max: ok(l) ? 100 : null, fill: false, title: "GPU " + g.index + " history", empty: "collecting history…"}); }); };
/* Many GPUs (more than 2): compact tiles. Smaller dial and ring, four plain numbers (no sub-lines), a short history
   strip (hidden when the tile is too short) and as many columns as give the largest tiles. The 2-GPU layout is untouched. */
function gridFor(n, W, H, gap, aspect) { var best = [1, 0]; for (var c = 1; c <= n; c++) { var r = Math.ceil(n / c), w = (W - (c - 1) * gap) / c, h = (H - (r - 1) * gap) / r, sc = Math.min(w / aspect, h); if (sc > best[1]) best = [c, sc]; } return best[0]; }
function gpuCompact(b, G, rs) {
  var cols = gridFor(G.length, b.clientWidth, b.clientHeight, 8, 2), rows = Math.ceil(G.length / cols), th = (b.clientHeight - (rows - 1) * 8) / rows, tw = (b.clientWidth - (cols - 1) * 8) / cols;
  var gz = Math.round(Math.max(24, Math.min(th - 30 - (th < 112 ? 0 : th * .26), tw * .2, 72)));
  var nar = tw < 240;
  b.innerHTML = '<div class="gpus gcompact' + (th < 112 ? " nohist" : "") + (nar ? " narrow" : "") + '" style="--gz:' + gz + 'px;grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">' + G.map(function (g, i) { var l = glimit(g);
    return '<div class="gpu"><h4>GPU ' + g.index + " <small>" + esc((gname(g, i) || "").replace(/NVIDIA GeForce |AMD Radeon /, "")) + '</small></h4><div class="gcrow"><div class="gauge" id="gt' + i + '"></div><div class="gauge" id="gd' + i + '"></div>' +
      '<div class="gkv" data-fit="16" data-min="9"><div class="fit-in"><p><small>Power</small><b>' + v(g.power, function (x) { return Math.round(x) + (ok(l) && !nar ? " / " + Math.round(l) : "") + " W"; }) + "</b></p>" + (nar ? "" : "<p><small>Temp</small><b>" + v(g.temp, function (x) { return x + " °C"; }) +
      "</b></p><p><small>Util</small><b>" + v(g.util, function (x) { return x + " %"; }) + "</b></p>") + "<p><small>VRAM</small><b>" + (ok(g.mem_used) ? (nar ? gb(g.mem_used) + " GiB" : gb(g.mem_used) + " / " + gb(g.mem_total) + " GiB") : NA) + '</b></p></div></div></div><div class="hist" id="gh' + i + '"></div></div>'; }).join("") + "</div>";
  G.forEach(function (g, i) { C.ring($("#gd" + i), {value: g.util, max: 100, label: ok(g.util) ? (nar ? g.util + "%" : "") : null, title: "GPU " + g.index + " utilization"});
    C.dial($("#gt" + i), {value: g.temp, min: 20, max: 100, unit: "°", label: nar ? null : "", title: "GPU " + g.index + " temperature"});
    if (th < 112) return; var l = glimit(g);
    C.area($("#gh" + i), {yaxis: false, legend: false, series: [{label: "util %", data: bucket(gh(rs, i, "util"), 60), color: "accent"},
      {label: "power %", data: bucket(col(rs, function (s) { var x = (s.gpus || [])[i]; return x && ok(x.power) ? (ok(l) ? x.power / l * 100 : x.power) : null; }), 60), color: "warning"}],
      min: 0, max: ok(l) ? 100 : null, fill: false, title: "GPU " + g.index + " history (util %, power % of limit)", empty: "collecting…"}); }); }
R.alerts = function (b) { b.className = "cb scroll"; b.innerHTML = '<div class="alerts">' + UI.alerts.map(alertHtml).join("") + "</div>"; };
function bucket(arr, n) { if (arr.length <= n) return arr; var out = [], k = arr.length / n; for (var i = 0; i < n; i++) { var seg = arr.slice(Math.floor(i * k), Math.floor((i + 1) * k)).filter(ok); out.push(seg.length ? seg.reduce(function (a, x) { return a + x; }, 0) / seg.length : null); } return out; }
R.thermal = function (b) { var G = gpus(), rs = hwin(); C.heat(b, {time: TW(rs), rows: G.map(function (g) { return "GPU " + g.index; }), values: G.map(function (g, i) { return bucket(gh(rs, i, "temp"), 36); }), min: 30, max: 95, unit: "°C", empty: "collecting history…"});
  b.classList.toggle("heatmany", G.length > 2); var w = b.querySelector(".w-heat");
  if (w && G.length > 2) { var rh = (w.clientHeight - (G.length - 1)) / G.length; b.style.setProperty("--hl", Math.max(8, Math.min(12, rh - 1)) + "px"); } };
R.vram = function (b) { var G = gpus(), rs = hwin(); C.area(b, {time: TW(rs), series: G.map(function (g, i) { return {label: "GPU " + g.index, data: bucket(col(rs, function (s) { var x = (s.gpus || [])[i]; return x ? x.mem_used / 1073741824 : null; }), 120)}; }), stacked: true, min: 0, max: ok(hw().gpu_mem_total) ? hw().gpu_mem_total / 1073741824 : null, unit: " GiB", empty: "collecting history…"}); };
R.opower = function (b) { b.id = "b-opower"; powerHero(b, hwin(), true); };
R.power = function (b) { b.id = "b-power"; powerHero(b, hwin(), true); };
R.clocks = function (b) { var G = gpus(); if (!D.gpu || !D.gpu.source) return C.unavailable(b, "unavailable — no driver tool (nvidia-smi) found");
  b.innerHTML = "<table><tr><th>GPU</th><th>SM clock</th><th>Mem clock</th><th>Fan</th><th>Power limit</th></tr>" + G.map(function (g) { var d = drv(g.index) || {};
    return "<tr><td>GPU " + g.index + "</td><td>" + v(d.clock_sm, function (x) { return x + " MHz"; }) + "</td><td>" + v(d.clock_mem, function (x) { return x + " MHz"; }) + "</td><td>" + v(d.fan, function (x) { return x + "%"; }) + "</td><td>" + v(d.power_limit, function (x) { return Math.round(x) + " W"; }) + "</td></tr>"; }).join("") + "</table><p class='na' style='font-size:12px'>source: " + esc(D.gpu.source) + "</p>"; };
R.powercards_unused = function (b) { var G = gpus(), rs = hwin(); C.area(b, {series: G.map(function (g, i) { return {label: "GPU " + g.index + (ok(glimit(g)) ? " (limit " + Math.round(glimit(g)) + " W)" : ""), data: bucket(gh(rs, i, "power"), 120)}; }), min: 0, max: Math.max.apply(null, G.map(glimit).filter(ok).concat([0])) || null, unit: " W", fill: false, title: "per-GPU power", empty: "collecting history…"}); };
R.pcie = function (b) { var h = hw(); b.className = "cb scroll";
  b.innerHTML = "<table><tr><th>Link</th><th>Gen</th><th>Width</th><th>RX / TX MB/s</th><th>SM / mem MHz</th><th>Fan</th></tr><tr><td>Strata</td><td>" + v(h.gpu_pcie_gen) + "/" + v(h.gpu_pcie_gen_max) + "</td><td>" + v(h.gpu_pcie_width, function (w) { return "x" + w; }) + "</td><td>" + v(h.gpu_pcie_rx_mb, function (x) { return Math.round(x); }) + " / " + v(h.gpu_pcie_tx_mb, function (x) { return Math.round(x); }) + "</td><td>—</td><td>—</td></tr>" +
    gpus().map(function (g) { var d = drv(g.index); if (!d) return "<tr><td>GPU " + g.index + "</td><td colspan='5'>" + NA + "</td></tr>";
      return "<tr><td>GPU " + g.index + "</td><td>" + v(d.pcie_gen) + "/" + v(d.pcie_gen_max) + "</td><td>" + v(d.pcie_width, function (w) { return "x" + w + (ok(d.pcie_width_max) ? "/x" + d.pcie_width_max : ""); }) + "</td><td>" + v(d.pcie_rx_kbs, function (x) { return Math.round(x / 1024); }) + " / " + v(d.pcie_tx_kbs, function (x) { return Math.round(x / 1024); }) + "</td><td>" + v(d.clock_sm) + " / " + v(d.clock_mem) + "</td><td>" + v(d.fan, function (x) { return x + "%"; }) + "</td></tr>"; }).join("") +
    "</table><p class='na' style='font-size:11.5px;margin:4px 0 0'>per-GPU rows: " + (D.gpu && D.gpu.source ? esc(D.gpu.source) : "unavailable (no driver tool)") + "</p>"; };
R.p2p = function (b) { var G = gpus(); C.heat(b, {rows: G.map(function (g) { return "GPU " + g.index; }), values: G.map(function () { return G.map(function () { return null; }); }), empty: "unavailable — Strata does not measure GPU-to-GPU bandwidth"});
  };

/* flow */
function prefillStage(L) { var r = lastReq(), rate, note;
  if (L.state === "reading") { rate = L.prefill_tok_s_mean; note = ok(L.prompt_read) && ok(L.prompt_total) ? L.prompt_read.toLocaleString() + " / " + L.prompt_total.toLocaleString() + " read" : "prompt read starting"; }
  else { rate = r && ok(r.prompt_read) && r.prompt_ms > 0 ? r.prompt_read / (r.prompt_ms / 1000) : null; note = rate != null ? "last request · " + r.prompt_read.toLocaleString() + " tokens read" : "no finished request yet"; }
  return ["Prefill tok/s", "bolt", rate != null ? Math.round(rate) : null, note, 1]; }
R.pipeline = function (b) { var L = live(), sl = L.slots || [], c = function (s) { return sl.filter(function (x) { return x.state === s; }).length; }, t = (D.m || {}).totals || {};
  var dec = sl.length ? c("decoding") + (L.outside_slots && L.state === "generating" && !c("decoding") ? L.outside_slots : 0) : null;
  var st = [["Queued", "list", ok(L.queued) || ok(L.waiting) ? (L.queued || 0) + (L.waiting || 0) + (L.admitting || 0) : null, "engine " + v(L.queued) + " · pre-admit " + v(L.waiting) + " · admitting " + v(L.admitting)],
    ["Reading", "db", sl.length ? c("reading") + (L.outside_slots && L.state === "reading" && !c("reading") ? L.outside_slots : 0) : null, "requests reading the prompt"], prefillStage(L),
    ["Decode", "act", dec, "slots generating tokens"], ["Completed", "shield", t.requests, "since start"]];
  b.innerHTML = '<div class="pipe">' + st.map(function (s, i) { var hot = ok(s[2]) && s[2] > 0 && i < 4 && (i !== 2 || L.state === "reading");
    return (i ? '<div class="flowline' + (hot || (i > 0 && i !== 3 && ok(st[i - 1][2]) && st[i - 1][2] > 0) || (i === 3 && st[1][2] > 0) ? " on" : "") + '"><i></i><i></i><i></i></div>' : "") + '<div class="stage ' + (hot ? "hot" : "") + (i === 2 && s[4] ? " pf" : "") + '" data-fit="34"><div class="sic">' + ic(s[1]) + '</div><div class="fit-in"><b>' + v(s[2], function (x) { return x.toLocaleString(); }) + "</b><small>" + s[0] + "</small><em>" + s[3] + "</em></div></div>"; }).join("") + "</div>"; };
R.queue = function (b) { var rs = hwin(); C.area(b, {time: TW(rs), series: [{label: "total", data: bucket(col(rs, function (s) { return (s.queued || 0) + (s.waiting || 0) + (s.admitting || 0); }), 120), color: "#22d3ee"}, {label: "engine", data: bucket(col(rs, function (s) { return s.queued; }), 120), color: "#a78bfa"}, {label: "pre-admit", data: bucket(col(rs, function (s) { return s.waiting; }), 120), color: "#fbbf24"}], min: 0, max: 1, fill: false, empty: "collecting history…"}); };
function latSeries() { var q = reqs(), out50 = [], out95 = [], k = 10; for (var i = k; i <= q.length; i += Math.max(1, Math.floor(q.length / 60))) { var w = q.slice(i - k, i).map(function (r) { return r.duration_s; }); out50.push(quant(w, .5)); out95.push(quant(w, .95)); } return [out50, out95]; }
R.latency = function (b) { var s = latSeries(), q = reqs().map(function (r) { return r.duration_s; });
  A("latency").innerHTML = "<small style='color:var(--mu)'>p50 " + v(quant(q, .5), function (x) { return n1(x) + "s"; }) + " · p95 " + v(quant(q, .95), function (x) { return n1(x) + "s"; }) + "</small>";
  C.area(b, {xticks: ['oldest', '', '', '', 'latest'], xlabel: 'finished requests (rolling 10)', series: [{label: "p50", data: s[0], color: "#34d399"}, {label: "p95", data: s[1], color: "#fb7185"}], min: 0, unit: "s", fill: false}); };
R.parallel = function (b) { var L = live(), rs = hwin(); b.innerHTML = '<div style="display:grid;grid-template-columns:110px 1fr;grid-template-rows:minmax(0,100%);gap:8px;height:100%"><div id="pr"></div><div id="pa"></div></div>';
  C.ring($("#pr"), {value: L.running, max: L.parallel || 1, label: ok(L.running) ? L.running + "/" + v(L.parallel) : null, sub: "running / slots"});
  C.area($("#pa"), {time: TW(rs), series: [{label: "running", data: bucket(col(rs, function (s) { return s.running; }), 120)}, {label: "slots", data: bucket(col(rs, function (s) { return s.parallel; }), 120), color: "#64748b"}], min: 0, fill: false, empty: "collecting history…"}); };
R.active = function (b) { var L = live(), rows = slotRows(); b.className = "cb scroll";
  if (!rows.length && L.state === "generating") rows.push({id: "—", state: "decode", slot: "outside", tokens: L.generated, detail: L.phase});
  if (!rows.length && L.state === "reading") rows.push({id: "—", state: "reading", slot: "outside", tokens: ok(L.prompt_read) ? L.prompt_read : L.prompt_tokens, detail: L.phase});
  b.innerHTML = "<table><tr><th>ID</th><th>Stage</th><th>Tokens</th><th>Slot</th><th>Harness / client</th><th>Detail</th></tr>" + (rows.length ? rows.map(function (r) {
    return "<tr><td>" + r.id + "</td><td><span class='st " + r.state + "'>" + r.state + "</span></td><td>" + v(r.tokens) + "</td><td>" + v(r.slot) + "</td><td>" + NA + "</td><td>" + esc(r.detail || "") + "</td></tr>"; }).join("") : "<tr><td colspan='6'><span class='na'>no active requests</span></td></tr>") +
    "</table><p class='na' style='font-size:11px'>Harness / client: unavailable — Strata does not record which client sent a request (gap reported below on the Config page).</p>"; };
R.mix = function (b) { var m = {}; reqs().forEach(function (r) { m[r.finish] = (m[r.finish] || 0) + 1; }); var cols = {stop: "#34d399", length: "#fbbf24", tool_calls: "#22d3ee", error: "#fb7185", cancelled: "#a78bfa"};
  C.donut(b, {segments: Object.keys(m).map(function (k) { return {label: k, value: m[k], color: cols[k]}; }), sub: "recent requests"}); };
R.gantt = function (b) { var rs = hwin(), now = Date.now() / 1000, t0 = now - UI.range, L = live(), n = (L.slots || []).length; var lanes = [];
  for (var i = 0; i < n; i++) { var bars = [], cur = null; rs.forEach(function (s) { var st = (s.slot_states || [])[i]; if (st && st !== "idle") { if (cur && cur.state === st && s.t - cur.end < 6) cur.end = s.t; else { cur = {start: s.t, end: s.t + 2, state: st}; bars.push(cur); } } else cur = null; });
    lanes.push({label: "slot " + i, bars: bars.map(function (x) { return {start: x.start, end: x.end, color: x.state === "reading" ? "#60a5fa" : "#34d399", label: x.state}; })}); }
  var req = reqs().filter(function (r) { return r.time > t0; }).map(function (r) { return {start: r.time - r.duration_s, end: r.time - r.decode_ms / 1000, color: "#60a5fa", label: "prompt"}; })
    .concat(reqs().filter(function (r) { return r.time > t0; }).map(function (r) { return {start: r.time - r.decode_ms / 1000, end: r.time, color: "#a78bfa", label: "decode"}; }));
  lanes.push({label: "requests", bars: req});
  C.gantt(b, {title: "scheduler timeline", now: now, lanes: lanes, t0: t0, t1: now}); };

/* perf */
function stats(list) { if (!list.length) return null; var s = function (f) { var a = list.map(f).filter(ok); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  return {tok: s(function (r) { return r.decode_tok_s; }), ttft: s(function (r) { return r.prompt_ms / 1000; }), dur: s(function (r) { return r.duration_s; }), hit: s(function (r) { return r.hit_rate * 100; }),
    err: list.filter(function (r) { return ["stop", "length", "tool_calls"].indexOf(r.finish) < 0; }).length / list.length * 100, acc: s(function (r) { return r.drafts_offered ? r.drafts_accepted / r.drafts_offered * 100 : null; })}; }
/* live top row: every tile reads the monitor's sample history (/monitor/history) plus the newest /metrics poll */
function winRate(rs, i, num, den, sec) { var s = rs[i], j = i; while (j > 0 && s.t - rs[j - 1].t <= sec) j--; var b = rs[j];
  if (!b || b === s || !ok(s[num]) || !ok(b[num]) || !ok(s[den]) || !ok(b[den])) return null; var d = s[den] - b[den]; return d > 0 ? (s[num] - b[num]) / d * 100 : null; }
R.pkpi = function (b) { var rs = hwin().filter(function (s) { return s.ok; }), L = live(), t = (D.m || {}).totals || {}, n = rs.length;
  var acc = col(rs, function (s) { return s.drafts_off ? s.drafts_acc / s.drafts_off * 100 : null; });
  var accNow = n > 1 && ok(rs[0].drafts_off) && rs[n - 1].drafts_off > rs[0].drafts_off ? (rs[n - 1].drafts_acc - rs[0].drafts_acc) / (rs[n - 1].drafts_off - rs[0].drafts_off) * 100 : null;
  var allAcc = t.drafts_offered ? t.drafts_accepted / t.drafts_offered * 100 : null;
  var reuseR = n > 1 && ok(rs[0].reused) && ok(rs[n - 1].reused) && rs[n - 1].prompt_tok > rs[0].prompt_tok ? (rs[n - 1].reused - rs[0].reused) / (rs[n - 1].prompt_tok - rs[0].prompt_tok) * 100 : null;
  var allReuse = t.prompt_tokens ? t.reused / t.prompt_tokens * 100 : null;
  var dec = L.state === "generating" ? L.tok_s : (D.m ? 0 : null);
  var k = [["Decode tok/s", dec, "", col(rs, function (s) { return s.state === "generating" ? s.tok_s : 0; }), "live, all streams"],
    ["Prefill tok/s", L.prefill_tok_s_mean, "", col(rs, function (s) { return s.prefill; }), "Strata mean"],
    ["Active streams", L.running, ok(L.parallel) ? " / " + L.parallel : "", col(rs, function (s) { return s.running; }), "slots in use"],
    ["Queue", ok(L.queued) || ok(L.waiting) ? (L.queued || 0) + (L.waiting || 0) + (L.admitting || 0) : null, "", col(rs, function (s) { return (s.queued || 0) + (s.waiting || 0) + (s.admitting || 0); }), "queued + waiting + admitting"]];
  b.innerHTML = '<div class="kpis">' + k.map(function (x, i) { return '<div class="kpi"><small>' + x[0] + "</small><b>" + v(x[1], n1) + "<em>" + (ok(x[1]) ? x[2] : "") + "</em></b><span class='pks'>" + x[4] + "</span><div class='sp' id='pk" + i + "'></div></div>"; }).join("") + "</div>";
  k.forEach(function (x, i) { C.spark($("#pk" + i), {data: bucket(x[3], 60)}); }); };
R.dualc = function (b) { var q = reqs().slice(-120); C.dual(b, {time: q.length > 1 ? {t0: q[0].time, t1: q[q.length - 1].time, now: Date.now() / 1000} : null, xlabel: 'last ' + q.length + ' requests', a: {label: "decode tok/s", data: q.map(function (r) { return r.decode_tok_s; }), color: "#22d3ee"}, b: {label: "duration", data: q.map(function (r) { return r.duration_s; }), unit: "s", color: "#a78bfa"}}); };
R.rings = function (b) { var G = gpus(), t = (D.m || {}).totals || {}, h = hw(); var acc = t.drafts_offered ? t.drafts_accepted / t.drafts_offered * 100 : null; var tpw = ok(live().tok_s) && ok(h.gpu_power) && h.gpu_power > 0 ? live().tok_s / h.gpu_power : null;
  var many = G.length > 2, n = G.length + 2, cols = many ? gridFor(n, b.clientWidth, b.clientHeight, 8, 1) : Math.min(4, n);
  if (!many && n === 4 && narrowCard(b.closest(".card")) && Math.min((b.clientWidth - 8) / 2, (b.clientHeight - 8) / 2) > 1.15 * Math.min((b.clientWidth - 24) / 4, b.clientHeight)) cols = 2;
  var rows = Math.ceil(n / cols), sz = Math.min((b.clientWidth - (cols - 1) * 8) / cols, (b.clientHeight - (rows - 1) * 8) / rows);
  var avg = many && sz < 64; if (avg) { cols = 3; rows = 1; }
  var U = G.map(function (g) { return g.util; }).filter(ok);
  b.innerHTML = '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);' + (many ? "grid-template-rows:repeat(" + rows + ",minmax(0,1fr));" : "") + 'gap:8px;height:100%">' + (avg ? '<div id="rga"></div>' : G.map(function (g, i) { return '<div id="rg' + i + '"></div>'; }).join("")) + '<div id="rge"></div><div id="rgw"></div></div>';
  if (avg) C.ring($("#rga"), {value: U.length ? U.reduce(function (a, x) { return a + x; }, 0) / U.length : null, sub: G.length + " GPUs avg " + (U.length ? Math.min.apply(null, U) + "–" + Math.max.apply(null, U) + "%" : "")});
  else G.forEach(function (g, i) { C.ring($("#rg" + i), {value: g.util, sub: "GPU " + g.index}); });
  C.ring($("#rge"), {value: acc, sub: "draft accept", color: "#a78bfa"}); C.ring($("#rgw"), {value: ok(tpw) ? tpw : live().state !== "generating" ? 0 : null, max: 1, label: ok(tpw) ? tpw.toFixed(2) : live().state !== "generating" ? "idle" : null, sub: "tok/s per W", color: "#34d399"}); };
R.sla = function (b) { var vs = D.vs || {}, rs = D.hist, okc = rs.filter(function (s) { return s.ok; }).length, q = reqs(), e = q.length ? q.filter(function (r) { return ["stop", "length", "tool_calls"].indexOf(r.finish) < 0; }).length / q.length * 100 : null;
  b.innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;height:calc(100% - 34px);grid-template-rows:100%;overflow:hidden" class="slarings"><div id="s1"></div><div id="s2"></div><div id="s3"></div></div><div class="slafoot"><span>Uptime <b>' + v(vs.uptime_s, dur) + "</b></span><span>Samples <b>" + rs.length + "</b></span><span>Requests <b>" + q.length + "</b></span></div>";
  C.ring($("#s1"), {value: rs.length ? okc / rs.length * 100 : null, label: rs.length ? (okc / rs.length * 100).toFixed(1) + "%" : null, sub: "reachable", color: "#34d399"});
  C.ring($("#s2"), {value: vs.loaded === true ? 100 : vs.loaded === false ? 0 : null, label: vs.loaded ? "ready" : vs.loaded === false ? "no" : null, sub: "readiness", color: "#34d399"});
  C.ring($("#s3"), {value: e, label: ok(e) ? e.toFixed(1) + "%" : null, sub: "error rate", color: "#fb7185"}); };
R.compare = function (b) { var q = reqs(), hot = q.filter(function (r) { return ok(r.hit_rate) && r.hit_rate >= .5; }), cold = q.filter(function (r) { return ok(r.hit_rate) && r.hit_rate < .5; });
  var med = function (l, f) { var x = l.map(f).filter(ok); return x.length ? quant(x, .5) : null; };
  var rows = [null, ["Decode tok/s (median)", med(hot, function (r) { return r.decode_tok_s; }), med(cold, function (r) { return r.decode_tok_s; }), n1],
    ["Prompt read s (median)", med(hot, function (r) { return ok(r.prompt_ms) ? r.prompt_ms / 1000 : null; }), med(cold, function (r) { return ok(r.prompt_ms) ? r.prompt_ms / 1000 : null; }), function (x) { return x.toFixed(2); }],
    ["Duration s (median)", med(hot, function (r) { return r.duration_s; }), med(cold, function (r) { return r.duration_s; }), n1],
    ["Cache hit (median)", med(hot, function (r) { return r.hit_rate * 100; }), med(cold, function (r) { return r.hit_rate * 100; }), function (x) { return Math.round(x) + "%"; }],
    ["Draft accept", acc(hot), acc(cold), function (x) { return Math.round(x) + "%"; }]];
  b.innerHTML = '<div class="cmp"><div id="cmpc"></div><table class="cmpt"><tr><th></th><th>reused</th><th>fresh</th><th>Δ</th></tr>' + rows.slice(1).map(function (r) { var d = ok(r[1]) && ok(r[2]) && r[2] ? (r[1] / r[2] - 1) * 100 : null;
    var none = "<span class='na'>no requests yet</span>"; return "<tr><td>" + r[0] + "</td><td><b>" + (hot.length ? v(r[1], r[3]) : none) + "</b></td><td><b>" + (cold.length ? v(r[2], r[3]) : none) + "</b></td><td>" + (ok(d) && r[0] !== "Requests" ? "<span class='" + (d >= 0 ? "up" : "dn") + "'>" + (d >= 0 ? "+" : "") + Math.round(d) + "%</span>" : "—") + "</td></tr>"; }).join("") + "</table></div>";
  C.columns($("#cmpc"), {items: [{label: "reused tok/s", value: rows[1][1]}, {label: "fresh tok/s", value: rows[1][2], color: "#a78bfa"}, {label: "reused read s", value: rows[2][1], color: "#34d399"}, {label: "fresh read s", value: rows[2][2], color: "#fbbf24"}].filter(function (x, i) { return i % 2 ? cold.length : hot.length; })});
  A("compare").innerHTML = "<small style='color:var(--mu)'>" + hot.length + " reused · " + cold.length + " fresh</small>"; };
function acc(l) { var o = 0, a = 0; l.forEach(function (r) { if (ok(r.drafts_offered) && ok(r.drafts_accepted)) { o += r.drafts_offered; a += r.drafts_accepted; } }); return o ? a / o * 100 : null; }
R.lathist = function (b) { var d = reqs().map(function (r) { return r.duration_s; }).filter(ok); if (d.length < 3) return C.unavailable(b, "needs finished requests");
  var edges = [0, 2, 5, 10, 20, 40, 80, Infinity], items = []; for (var i = 0; i < edges.length - 1; i++) { var lo = edges[i], hi = edges[i + 1];
    items.push({label: hi === Infinity ? ">" + lo + "s" : lo + "–" + hi + "s", value: d.filter(function (x) { return x >= lo && x < hi; }).length, color: i < 2 ? "#34d399" : i < 4 ? "#22d3ee" : i < 5 ? "#fbbf24" : "#fb7185"}); }
  C.columns(b, {items: items}); A("lathist").innerHTML = "<small style='color:var(--mu)'>" + d.length + " requests · p95 " + n1(quant(d, .95)) + "s</small>"; };
function promParse(t) { var o = {}; (t || "").split("\n").forEach(function (l) { if (l && l[0] !== "#") { var p = l.trim().split(/\s+/); o[p[0]] = +p[1]; } }); return o; }
R.prom = function (b) { var p = promParse(D.prom); var keys = Object.keys(p); b.className = "cb scroll"; var brk = narrowCard(b.closest(".card"));  /* narrow card: names may wrap at "_" */
  b.innerHTML = keys.length ? "<table>" + keys.map(function (k) { return "<tr><td title=\"" + esc(k) + "\">" + esc(k.replace(/^(llamacpp|strata):/, "")).replace(/_/g, brk ? "_<wbr>" : "_") + "</td><td style='text-align:right'><b>" + n1(p[k]) + "</b></td></tr>"; }).join("") + "</table>" : NA; };
R.anomaly = function (b) { var d = col(hwin(), function (s) { return s.tok_s; }); d = bucket(d, 150); var vals = d.filter(ok);
  if (vals.length < 5) return C.unavailable(b, "collecting history…"); var mean = vals.reduce(function (a, x) { return a + x; }, 0) / vals.length, sd = Math.sqrt(vals.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / vals.length);
  var marks = []; d.forEach(function (x, i) { if (ok(x) && Math.abs(x - mean) > 2 * sd) marks.push(i); });
  var tail = d.slice(-30).map(function (x, i) { return [i, x]; }).filter(function (p) { return ok(p[1]); }), n = tail.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
  tail.forEach(function (p) { sx += p[0]; sy += p[1]; sxy += p[0] * p[1]; sxx += p[0] * p[0]; }); var sl = n > 1 ? (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx) : 0, ic0 = (sy - sl * sx) / Math.max(1, n);
  var fc = []; for (var i = 1; i <= 15; i++) fc.push(Math.max(0, ic0 + sl * (29 + i)));
  C.area(b, {time: TW(hwin()), series: [{label: "tok/s", data: d}], forecast: fc, marks: marks, min: 0, unit: " tok/s"});
  A("anomaly").innerHTML = "<small style='color:var(--mu)'>mean " + n1(mean) + " · σ " + n1(sd) + " · " + marks.length + " outliers</small>"; };

/* config page (item 36) */
function cfgVal(k) { var c = D.cfg && D.cfg.keys; if (!c) return undefined; var f = c.filter(function (x) { return x.key === k; })[0]; return f ? f.value : undefined; }
function cfgShow(k) { var x = cfgVal(k); return x === null ? "not set (Strata default)" : x; }
function kv(rows) { return '<div class="kv">' + rows.map(function (r) { return "<span>" + r[0] + "</span><b>" + (r[1] === undefined || r[1] === null || r[1] === "" ? NA : esc(typeof r[1] === "object" ? JSON.stringify(r[1]) : r[1])) + "</b>"; }).join("") + "</div>"; }
R.packs = function (b) { var e = (D.m || {}).engine || {}, vs = D.vs || {}, model = vs.model || e.model || ""; var active = (model.match(/-(iq\w+|q\w+)$/i) || [])[1];
  b.className = "cb scroll"; b.innerHTML = kv([["Active pack", active], ["Installed packs", D.info && D.info.installed_packs ? D.info.installed_packs.join(", ") : null], ["Config file", D.cfg && D.cfg.file], ["Engine", vs.engine],
    ["KV cache", e.kv], ["KV resident", e.kv_resident], ["Expert slots", e.expert_slots], ["Expert cache", ok(e.expert_cache_mib) ? e.expert_cache_mib + " MiB" : null], ["Arena", ok(e.arena_mib) ? e.arena_mib + " MiB" : null],
    ["Pool workers", e.pool_workers], ["PCIe fraction", e.pcie_frac], ["VRAM free", ok(e.vram_free_mib) ? e.vram_free_mib + " MiB" : null], ["VRAM elastic", (vs.vram || {}).elastic], ["Batch slots / groups", ok(e.batch_slots) ? e.batch_slots + " / " + e.batch_groups : null]]); };
R.mtp = function (b) { var e = (D.m || {}).engine || {}, t = (D.m || {}).totals || {}; b.innerHTML = '<div style="display:grid;grid-template-columns:1fr 110px;gap:8px;height:100%"><div>' + kv([["mtp_max", e.mtp_max], ["spec (draft depth)", e.spec], ["spec_min_p", e.spec_min_p], ["lookup", e.lookup],
    ["Drafts offered", t.drafts_offered], ["Drafts accepted", t.drafts_accepted]]) + '</div><div id="mtpr"></div></div>'; C.ring($("#mtpr"), {value: t.drafts_offered ? t.drafts_accepted / t.drafts_offered * 100 : null, sub: "accepted", color: "#a78bfa"}); };
R.sampling = function (b) { var st = D.st || {}; b.className = "cb scroll"; b.innerHTML = kv([["temperature", cfgShow("sampling.temperature")], ["top_p", cfgShow("sampling.top_p")], ["top_k", cfgShow("sampling.top_k")], ["min_p", cfgShow("sampling.min_p")],
    ["Reasoning budget", cfgShow("reasoning_budget_tokens")], ["Live: busy", st.busy], ["Live: phase", st.phase], ["Live: thinking budget", st.thinking_budget === null ? "none" : st.thinking_budget], ["Live: tool", st.tool === null ? "none" : st.tool], ["Reasoning recoveries", st.reasoning_recoveries], ["Generated / max", ok(st.generated) ? st.generated + " / " + st.max_tokens : null]]) +
    "<h4 style='margin:10px 0 4px;font-size:11px;color:var(--cy)'>ALL RUN-CONFIG KEYS (/config)</h4>" + kv(((D.cfg && D.cfg.keys) || []).filter(function (k) { return !/^sampling\.|^reasoning_budget/.test(k.key); }).map(function (k) { return [k.key, k.value === null ? "not set (Strata default)" : k.value]; })) +
    "<p style='font-size:11px;color:var(--mu)'>Change these on Control &amp; Health › Model settings. &ldquo;not set&rdquo; means the run config leaves the key empty, so Strata uses its built-in default (see each key's help on Control &amp; Health) or the request's own value.</p>"; };
R.apis = function (b) { var vs = D.vs || {}, so = vs.structured_output || {}; b.className = "cb scroll"; b.innerHTML = kv([["API styles", (vs.dialects || []).join("  ")], ["Structured output", (so.formats || []).join(", ")], ["Method", so.method], ["Constrained decoding", so.constrained_decoding],
    ["Auto-load", vs.auto_load], ["Idle unload", cfgVal("idle_unload_s") === null || cfgVal("idle_unload_s") === 0 ? "never (not set)" : cfgVal("idle_unload_s") !== undefined ? cfgVal("idle_unload_s") + " s" : cfgVal("idle_unload")], ["Context (native)", (vs.context || {}).native], ["Max positions", (vs.context || {}).max_positions], ["Cache max tokens", vs.cache_max_tokens],
    ["Concurrency", vs.concurrency ? vs.concurrency.serving + " serving / " + vs.concurrency.requested + " requested" : null], ["Vision", vs.vision ? (vs.vision.enabled ? "enabled" : "disabled") : null], ["API key required", D.health && D.health.api_key]]); };
R.cache = function (b) { var c = (D.m || {}).conversation_cache || {}, t = (D.m || {}).totals || {}; b.innerHTML = '<div style="display:grid;grid-template-columns:1fr 110px;gap:8px;height:100%"><div class="cb scroll">' + kv([["Enabled", c.enabled], ["Budget", ok(c.budget_mib) ? c.budget_mib + " MiB" : null], ["Parked / slots", ok(c.parked) ? c.parked + " / " + c.slots : null],
    ["Last event", c.last_event ? c.last_event + " (" + (c.last_tokens || 0).toLocaleString() + " tok, " + ago(c.last_at) + " ago)" : null], ["Parks / restores / evictions", ok(c.parks) ? c.parks + " / " + c.restores + " / " + c.evictions : null],
    ["All-time cached tokens", ok(t.reused) ? t.reused.toLocaleString() : null], ["Reused (cache window)", ok(c.reused_tokens) ? c.reused_tokens.toLocaleString() : null]]) + '</div><div id="cr"></div></div>';
  C.donut($("#cr"), {segments: ok(c.requests) ? [{label: "reused", value: c.requests_reused, color: "#34d399"}, {label: "fresh", value: c.requests - c.requests_reused, color: "#334155"}] : [], center: ok(c.requests) ? Math.round(c.requests_reused / c.requests * 100) + "%" : null, legend: false, sub: "reuse"}); };
R.misc = function (b) { var lt = (D.vs || {}).last_timings || {}, q = reqs(), last = q[q.length - 1] || {}, mcp = D.mcp || {}; b.className = "cb scroll";
  b.innerHTML = kv([["Last: prompt", ok(lt.prompt_n) ? lt.prompt_n + " tok @ " + n1(lt.prompt_per_second) + " tok/s" : null], ["Last: cached", lt.cache_n], ["Last: decode", ok(lt.predicted_n) ? lt.predicted_n + " tok @ " + n1(lt.predicted_per_second) + " tok/s" : null],
    ["Last: drafts", ok(lt.draft_n) ? lt.draft_n_accepted + " / " + lt.draft_n : null], ["Offload: PCIe share", ok(last.pcie_share) ? (last.pcie_share * 100).toFixed(1) + "%" : null], ["Offload: RAM / file blobs", ok(last.ram_blobs) ? last.ram_blobs + " / " + last.file_blobs + " (" + n1(last.file_mb || 0) + " MB)" : null],
    ["MCP servers", mcp.servers ? (mcp.servers.length ? mcp.servers.map(function (s) { return s.name || s; }).join(", ") : "none configured") : null], ["MCP tools", mcp.tools], ["Replicas", null], ["Slot save / restore", (D.props && D.props.total_slots) ? "available (Control & Health › Slots, confirmed)" : null]]) +
    '<button class="btn sm sec" style="margin-top:8px" id="slotbtn">Slot save / restore…</button><h4 style="margin:10px 0 4px;font-size:11px;color:var(--am)">STRATA GAPS (not reported by Strata)</h4><ul style="margin:0;padding-left:16px;font-size:11px;color:var(--mu)"><li>Client / harness per request</li><li>Pre-admit oldest wait time</li><li>Per-GPU PCIe link (filled from the driver tool when present) and GPU-to-GPU bandwidth</li><li>Replica status</li><li>Request ids for live requests</li></ul>';
  $("#slotbtn").onclick = function () { go(PAGES.map(function (p) { return p.key; }).indexOf("control")); }; };

/* diagnostics + report */
function runDiag() { fetch("/monitor/diag/run", {method: "POST"}).then(function () { pollDiag(); }); }
function pollDiag() { get("/monitor/diag").then(function (d) { D.diag = d; if (PAGES[UI.page].key === "diag") { renderCard("diagrun"); var rp = $("#rp"); if (rp && rp.disabled && d.result) renderCard("report"); } if (d.running) setTimeout(pollDiag, 1500); }); }
R.diagrun = function (b) { var d = D.diag || {}, r = d.result; b.className = "cb scroll";
  b.innerHTML = '<p style="color:var(--mu);margin-top:0">Runs <code>setup.py --check</code> from your Strata folder (it only checks this PC and changes nothing) and takes a snapshot of /health, /v1/status and /metrics.</p><button class="btn" id="drun" ' + (d.running ? "disabled" : "") + ">" + (d.running ? "Running…" : "▶ Run Diagnostics") + "</button>" +
    (r ? '<div class="kv" style="margin:10px 0"><span>Command</span><b>' + v(r.command) + "</b><span>Exit code</span><b>" + v(r.rc) + "</b><span>Finished</span><b>" + new Date(r.finished * 1000).toLocaleString() + "</b></div><pre>" + esc(r.output) + "</pre>" : "<p class='na'>No diagnostics run yet.</p>");
  $("#drun").onclick = runDiag; };
R.report = function (b) { b.className = "cb scroll"; var has = D.diag && D.diag.result;
  b.innerHTML = '<p style="color:var(--mu);margin-top:0">Link the diagnostics to what you saw. Nothing is sent from here: Preview shows the exact text, then you open GitHub and submit it yourself.</p>' +
    '<label>Kind</label><select class="f" id="rk"><option value="issue">Issue (bug report)</option><option value="pr">Pull request</option></select><br><br><label>Title</label><input class="f" id="rt" placeholder="Short summary"><br><br><label>What happened (behavior)</label><textarea id="rd" rows="6" placeholder="What you did, what you got, what you expected"></textarea><br><br>' +
    '<button class="btn" id="rp" ' + (has ? "" : "disabled") + '>Preview report</button> <span class="na">' + (has ? "linked to diagnostics from " + new Date(D.diag.result.finished * 1000).toLocaleTimeString() : "run diagnostics first") + "</span><div id='rprev' style='margin-top:10px'></div>";
  if (UI.draft) { $("#rk").value = UI.draft.k; $("#rt").value = UI.draft.t; $("#rd").value = UI.draft.d; }
  ["rk", "rt", "rd"].forEach(function (id) { $("#" + id).oninput = function () { UI.draft = {k: $("#rk").value, t: $("#rt").value, d: $("#rd").value}; }; });
  $("#rp").onclick = function () { fetch("/monitor/issue/preview", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind: $("#rk").value, title: $("#rt").value, description: $("#rd").value})}).then(function (r) { return r.json(); }).then(function (p) {
    $("#rprev").innerHTML = '<div class="card" style="padding:12px"><b>' + esc(p.title) + "</b> <span class='st info'>" + p.kind + " · " + p.repo + "</span><pre style='max-height:260px;overflow:auto;margin-top:8px'>" + esc(p.body) + "</pre><p style='font-size:11px;color:var(--mu)'>" +
      (p.kind === "pr" ? "A pull request needs your own fork and branch. The button opens GitHub's compare page; paste this text as the PR description." : "The button opens GitHub's new-issue form, prefilled. You review and press Submit there — this monitor never posts.") +
      '</p><button class="btn sec" id="rcopy">Copy text</button> <button class="btn" id="ropen">I reviewed it — open GitHub to submit</button></div>';
    $("#rcopy").onclick = function () { copyText(p.body, this); };
    $("#ropen").onclick = function () { if (confirm("Open GitHub (" + p.repo + ") with this " + p.kind + "? You still submit it there yourself.")) window.open(p.url, "_blank", "noopener"); }; }); }; };

function renderCard(id) { var b = B(id); if (!b || !R[id]) return; try { R[id](b); } catch (e) { b.innerHTML = '<div class="w-unavail">unavailable</div>'; console.error(id, e); } b.dataset.rw = b.clientWidth; b.dataset.rh = b.clientHeight; fitCard(b); autoFit(b); declutter(b); }
/* Narrow cards (content narrower than at 1366x768: --refn is the card's content width there, less 1 px): titles shrink before they truncate (full title in the
   tooltip), and chart axis labels that would touch are hidden, keeping the first and the last. Wider cards are untouched. */
function narrowCard(cd) { var r = cd && parseFloat(cd.style.getPropertyValue("--refn")); return !!r && cd.clientWidth - 32 < r - 1; }
function fitTitle(cd) { var h = cd && cd.querySelector(".ch h3"); if (!h || cd.classList.contains("strip") || !h.offsetParent) return;
  var fit0 = function () { return h.scrollWidth <= h.clientWidth + .5 && h.scrollHeight <= h.clientHeight + .5; };  /* narrow cards allow two lines (CSS) */
  h.style.fontSize = ""; h.style.letterSpacing = ""; if (fit0()) return;
  var f = function (px) { h.style.fontSize = px + "px"; return fit0(); }, lo = 9.5, hi = parseFloat(getComputedStyle(h).fontSize);
  h.style.letterSpacing = ".03em"; if (f(hi)) return; if (!f(lo)) return;  /* still too long at the floor: CSS ellipsis + tooltip */
  for (var k = 0; k < 7; k++) { var mid = (lo + hi) / 2; if (f(mid)) lo = mid; else hi = mid; } f(Math.floor(lo * 4) / 4); }
function declutter(b) { var cd = b.closest(".card"); if (!narrowCard(cd)) return;
  [].slice.call(b.querySelectorAll(".w-yaxis,.w-xaxis,.w-gantt-axis")).forEach(function (ax) {
    var kids = [].slice.call(ax.children).filter(function (e) { return e.tagName !== "EM" && e.textContent.trim(); }), vert = ax.classList.contains("w-yaxis");
    kids.forEach(function (k) { k.style.visibility = ""; }); if (kids.length < 2) return;
    var R0 = kids.map(function (k) { return k.getBoundingClientRect(); }), keep = [0];
    var clash = function (a, p) { return vert ? a.top < p.bottom + 1 && a.bottom > p.top - 1 : a.left < p.right + 5 && a.right > p.left - 5; };
    if (!vert) { var axr = ax.getBoundingClientRect(), lastR = R0[kids.length - 1]; if (lastR.right > axr.right + 1) { kids[kids.length - 1].style.visibility = "hidden"; kids.pop(); R0.pop(); if (kids.length < 2) return; } }
    for (var i = 1; i < kids.length; i++) { if (!clash(R0[i], R0[keep[keep.length - 1]])) { keep.push(i); continue; }
      if (i === kids.length - 1 && keep.length > 1) { kids[keep.pop()].style.visibility = "hidden"; keep.push(i); } else kids[i].style.visibility = "hidden"; }
    var em = ax.querySelector("em"); if (em) { em.style.visibility = ""; var er = em.getBoundingClientRect();
      if (keep.some(function (j) { return clash(er, R0[j]); })) em.style.visibility = "hidden"; } }); }
/* Auto-fit: every [data-fit] box holds one .fit-in block whose sizes are in em. The largest font size (<= data-fit px,
   >= data-min px, default 8) at which the block fits the box's content area, both ways, is found by bisection. */
function fitOne(box) { var inn = box.querySelector(".fit-in"); if (!inn || !box.offsetParent) return;
  var cs = getComputedStyle(box), w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (w <= 0 || h <= 0) return; var lo = +(box.dataset.min || 8), hi = +(box.dataset.fit || 32);
  var fits = function (px) { inn.style.fontSize = px + "px"; return inn.scrollWidth <= w + .5 && inn.scrollHeight <= h + .5 && inn.offsetHeight <= h + .5; };
  if (fits(hi)) return; for (var k = 0; k < 9; k++) { var mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } inn.style.fontSize = Math.floor(lo * 4) / 4 + "px"; }
function autoFit(root) { [].slice.call((root || document).querySelectorAll("[data-fit]")).forEach(fitOne); if (root && root.dataset && root.dataset.fit) fitOne(root); }
var fitT = 0; window.addEventListener("resize", function () { clearTimeout(fitT); fitT = setTimeout(function () { layout(); render(); autoFit(document); }, 120); });
/* No scrolling: a card shows the rows that fit and moves the rest behind a labelled "More" button that opens
   a paged popup (no scrollbars there either). Works for tables, lists, alert stacks and key/value grids. */
function fitUnits(root) {
  /* Units in reading order: rows of tables, pairs of key/value grids, entries of lists and alert stacks, and
     any other direct child (headings, notes) as a whole. Hiding from the end keeps the first rows visible. */
  var out = [];
  [].slice.call(root.children).forEach(function (el) {
    if (el.classList.contains("fit-more")) return;
    if (el.tagName === "TABLE") { [].slice.call(el.querySelectorAll("tr")).forEach(function (r) { if (!r.querySelector("th")) out.push([r]); }); return; }
    if (el.classList.contains("kv")) { var k = el.children; for (var i = 0; i + 1 < k.length; i += 2) out.push([k[i], k[i + 1]]); return; }
    if (el.tagName === "UL" || el.tagName === "OL" || el.classList.contains("alerts")) { [].slice.call(el.children).forEach(function (c) { out.push([c]); }); return; }
    out.push([el]);
  });
  return out;
}
function fitTrim(root, units, over) {
  /* hide units from the end while `over()`; a table/grid/list whose rows are all hidden is hidden too */
  var hidden = 0;
  while (units.length > 1 && over()) { units.pop().forEach(function (n) { n.classList.add("fit-h"); }); hidden++; }
  [].slice.call(root.querySelectorAll("table, .kv, ul, ol, .alerts")).forEach(function (box) {
    var rows = box.tagName === "TABLE" ? [].slice.call(box.querySelectorAll("tr")).filter(function (r) { return !r.querySelector("th"); }) : [].slice.call(box.children);
    if (rows.length && rows.every(function (r) { return r.classList.contains("fit-h"); })) box.classList.add("fit-h"); });
  return hidden;
}
function shrinkInner(b) {
  [].slice.call(b.querySelectorAll("div")).forEach(function (d) { var cs = getComputedStyle(d);
    if (!/(hidden|auto|scroll)/.test(cs.overflowY) || d.closest("details") || d.classList.contains("w-plot") || d.querySelector("svg") && !d.querySelector(".kv, table")) return;
    var kids = [].slice.call(d.children); kids.forEach(function (c) { c.style.zoom = ""; }); if (d.scrollHeight <= d.clientHeight + 1 || !d.querySelector(".kv, table")) return;
    var z = function (f) { kids.forEach(function (c) { c.style.zoom = f; }); }, lo = .72, hi = 1; z(lo);
    for (var k = 0; k < 7; k++) { var mid = (lo + hi) / 2; z(mid); if (d.scrollHeight > d.clientHeight + 1) hi = mid; else lo = mid; } z(lo); }); }
function fitCard(b) {
  if (b.dataset.fitting) return; fitTitle(b.closest(".card")); b.dataset.fitting = "1";
  try { fitCardNow(b); shrinkInner(b); } catch (e) { console.error("fit", e); } finally { delete b.dataset.fitting; if (b.fitObs) b.fitObs.takeRecords(); }
  if (!b.fitRO && window.ResizeObserver) { var lastW = 0, lastH = 0; b.fitRO = new ResizeObserver(function () { if ((b.clientWidth === lastW && b.clientHeight === lastH) || b.dataset.fitting) return; lastW = b.clientWidth; lastH = b.clientHeight; fitCard(b); autoFit(b); declutter(b);
    clearTimeout(b.rrT); b.rrT = setTimeout(function () { var id = b.id.slice(2); if (STATIC[id] || !b.offsetParent || (b.clientWidth === +b.dataset.rw && b.clientHeight === +b.dataset.rh)) return; renderCard(id); }, 150); }); b.fitRO.observe(b); }
  if (!b.fitObs && window.MutationObserver) { b.fitObs = new MutationObserver(function () { if (!b.dataset.fitting) fitCard(b); }); b.fitObs.observe(b, {childList: true, subtree: true, characterData: true}); }
}
function fitCardNow(b) {
  var cd = b.closest(".card"), ic0 = cd && cd.querySelector(".ch .ic");
  if (ic0 && ic0.classList.contains("icmenu")) { ic0.classList.remove("icmenu"); ic0.onclick = ic0.onkeydown = null; ic0.removeAttribute("title"); ic0.removeAttribute("role"); ic0.removeAttribute("tabindex"); ic0.removeAttribute("aria-label"); delete ic0.dataset.more; }
  if (b.dataset.nofit) return;  /* cards that size their own content (auto-fit) never get a menu */
  b.classList.remove("scroll"); var old = b.querySelector(".fit-more"); if (old) old.remove();
  [].slice.call(b.querySelectorAll(".fit-h")).forEach(function (n) { n.classList.remove("fit-h"); });
  var kids = [].slice.call(b.children), zoom = function (f) { kids.forEach(function (c) { c.style.zoom = f; }); }, nar = narrowCard(b.closest(".card")), over = function () { return b.scrollHeight > b.clientHeight || nar && b.scrollWidth > b.clientWidth; };
  zoom(""); if (!over()) return;
  /* before hiding anything behind "More", try showing it all slightly smaller (down to 80 %); "More" only when it still cannot fit */
  var best = function (floor) { zoom(floor); if (over()) return false; var lo = floor, hi = 1; for (var k = 0; k < 8; k++) { var mid = (lo + hi) / 2; zoom(mid); if (over()) hi = mid; else lo = mid; } zoom(lo); return true; };
  if (best(.8)) return;
  zoom(""); var units = fitUnits(b);
  if (units.length < 2) { if (!best(.6)) zoom(.6); return; }  /* one nested layout block: nothing to page, so it is shown whole at the size that fits */
  var template = b.innerHTML, total = units.length;
  var card = b.closest(".card"), title = card && card.querySelector("h3") ? card.querySelector("h3").textContent : "Details";
  var hidden = fitTrim(b, units, over);
  if (over()) { if (!best(.6)) zoom(.6); }  /* what is left is one tall entry: show it smaller rather than cut */
  if (!hidden) return;
  /* the panel's header icon is its menu: it opens everything in a popup (paged only when the popup cannot hold it all) */
  var icon = card && card.querySelector(".ch .ic"); if (!icon) return;
  icon.classList.add("icmenu"); icon.dataset.more = hidden; icon.setAttribute("role", "button"); icon.tabIndex = 0;
  icon.title = "Show all of " + title + " (" + total + " rows; " + hidden + " not shown here)"; icon.setAttribute("aria-label", icon.title);
  icon.onclick = function () { pagedPopup(title, template); };
  icon.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pagedPopup(title, template); } };
}
function pagedPopup(title, template) {
  /* Pages are cut by measuring: each page shows the next units that fit the popup; no scrollbars. */
  modal(title, ""); var body = $("#mbody"); body.classList.add("paged");
  body.innerHTML = '<div class="pg-rows"></div><div class="pg-nav"><button class="btn sm sec" id="pgp" title="Previous page">&#8249; Prev</button><span id="pgi"></span><button class="btn sm sec" id="pgn" title="Next page">Next &#8250;</button></div>';
  var rows = body.querySelector(".pg-rows"), pages = [], start = 0;
  rows.innerHTML = template; var total = fitUnits(rows).length;
  while (start < total) {
    rows.innerHTML = template; var units = fitUnits(rows);
    units.slice(0, start).forEach(function (u) { u.forEach(function (n) { n.classList.add("fit-h"); }); });
    var rest = units.slice(start); var shown = rest.length - fitTrim(rows, rest, function () { return rows.scrollHeight > rows.clientHeight + 1; });
    pages.push([start, Math.max(1, shown)]); start += Math.max(1, shown);
  }
  var show = function (i) { var pg = pages[i]; rows.innerHTML = template; var units = fitUnits(rows);
    units.forEach(function (u, k) { if (k < pg[0] || k >= pg[0] + pg[1]) u.forEach(function (n) { n.classList.add("fit-h"); }); });
    fitTrim(rows, [], function () { return false; });
    $("#pgi").textContent = "Page " + (i + 1) + " of " + pages.length + " · " + total + " rows";
    $("#pgp").disabled = !i; $("#pgn").disabled = i + 1 >= pages.length;
    $("#pgp").onclick = function () { show(i - 1); }; $("#pgn").onclick = function () { show(i + 1); }; };
  show(0);
}
var STATIC = {report: 1, chatbox: 1, chatset: 1, runcfg: 1, lifecycle: 1, slotsc: 1};  // forms: drawn once per visit, then they update themselves
function render() { chrome(); var p = PAGES[UI.page]; p.cards.forEach(function (c) { var b = B(c[0]); if (STATIC[c[0]] && b && b.dataset.drawn && !b.dataset.retry) { if (R[c[0] + "Live"]) R[c[0] + "Live"](b); return; } renderCard(c[0]); if (STATIC[c[0]] && b) b.dataset.drawn = 1; });
  /* the grid settles after every card is drawn: fit each card again at its final size (two frames later) */
  requestAnimationFrame(function () { requestAnimationFrame(function () { p.cards.forEach(function (c) { var b = B(c[0]); if (b) { fitCard(b); autoFit(b); } }); }); }); }
window.SM = {go: go, D: D, R: R, B: B, A: A, modal: modal, esc: esc, NA: NA, ok: ok, v: v, dur: dur, n1: n1, gb: gb, ago: ago, PAGES: PAGES, UI: UI, renderCard: renderCard, get: get, fitOne: fitOne, autoFit: autoFit};
if (window.SMX) window.SMX(window.SM);
buildChrome(); layout(); poll(); pollSlow(); pollDiag(); setInterval(poll, 2000); setInterval(pollSlow, 30000); setInterval(function () { $("#age").textContent = D.at ? ago(D.at) : "—"; }, 500);
})();
