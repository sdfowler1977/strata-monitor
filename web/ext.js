/* Strata Monitor: Chat and Control & Health. Talks to Strata's API directly (through this monitor's local
   server), never through Strata's own pages. Destructive actions ask first. */
/* every POST to this monitor carries JSON + the per-run token the server put in the page */
(function () { var tok = (document.querySelector('meta[name="monitor-token"]') || {}).content || "", f0 = window.fetch.bind(window);
  window.fetch = function (url, o) { o = o || {}; if ((o.method || "GET").toUpperCase() === "POST" && String(url).charAt(0) === "/") {
    var h = new Headers(o.headers || {}); h.set("X-Monitor-Token", tok); if (!h.has("Content-Type")) h.set("Content-Type", "application/json"); o.headers = h; if (o.body == null) o.body = "{}";
    /* the monitor was restarted since this page loaded -> its token changed: pick up the new one from the page it now serves and retry once */
    return f0(url, o).then(function (r) { if (r.status !== 403 || o._retried) return r; return r.clone().text().then(function (t) { if (t.indexOf("monitor token") < 0) return r;
      return f0("/", {cache: "no-store"}).then(function (x) { return x.text(); }).then(function (html) { var mm = /name="monitor-token" content="([^"]+)"/.exec(html); if (!mm) return r;
        tok = mm[1]; h.set("X-Monitor-Token", tok); o._retried = 1; return f0(url, o); }); }); }); } return f0(url, o); }; })();
window.SMX = function (S) {
"use strict";
var $ = function (q) { return document.querySelector(q); }, esc = S.esc, R = S.R, NA = S.NA, ok = S.ok, v = S.v;
function post(path, body) { return fetch("/strata" + path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body || {})})
  .then(function (r) { return r.text().then(function (t) { var j; try { j = JSON.parse(t); } catch (e) { j = {raw: t}; } if (!r.ok) throw new Error((j.error && j.error.message) || ("HTTP " + r.status)); return j; }); }); }
function toast(msg, bad) { var t = document.createElement("div"); t.className = "toast " + (bad ? "bad" : ""); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 6000); }
function confirmDo(title, text, fn) { S.modal(title, "<p>" + text + "</p><button class='btn' id='cfy'>Yes, do it</button> <button class='btn sec' id='cfn'>Cancel</button>");
  $("#cfy").onclick = function () { $("#modal").classList.remove("open"); fn(); }; $("#cfn").onclick = function () { $("#modal").classList.remove("open"); }; }

/* ---------------- chat ---------------- */
var CH = {tabs: [], cur: 0, files: [], set: JSON.parse(localStorage.getItem("sm.chat") || "null") || {thinking: "high", temperature: 0, top_p: 0.95, top_k: 20, max: "", seed: "", show: true, mcp: true, esp: true}};

/* conversation tabs: each keeps its own history and its own stream (Strata has parallel slots); max 8; saved in localStorage */
var CHMAX = 8;
function newTab() { return {title: "Chat", named: false, msgs: [], busy: null}; }
(function () { try { var s = JSON.parse(localStorage.getItem("sm.chattabs") || "null"); if (s && s.tabs && s.tabs.length) { CH.tabs = s.tabs.slice(0, CHMAX).map(function (t) { return {title: t.title || "Chat", named: !!t.named, msgs: (t.msgs || []).filter(function (m) { return !m.pending; }), busy: null}; }); CH.cur = Math.min(s.cur || 0, CH.tabs.length - 1); } } catch (e) {}
  if (!CH.tabs.length) CH.tabs = [newTab()]; })();
function tab() { return CH.tabs[CH.cur] || CH.tabs[0]; }
function saveTabs() { var d = {cur: CH.cur, tabs: CH.tabs.map(function (t) { return {title: t.title, named: t.named, msgs: t.msgs.filter(function (m) { return !m.pending; }).map(function (m) { return {role: m.role, text: m.text, reasoning: m.reasoning, stats: m.stats, note: m.note, error: m.error, files: m.files}; })}; })};
  try { localStorage.setItem("sm.chattabs", JSON.stringify(d)); } catch (e) { try { d.tabs.forEach(function (t) { t.msgs.forEach(function (m) { delete m.files; delete m.reasoning; }); }); localStorage.setItem("sm.chattabs", JSON.stringify(d)); } catch (e2) {} } }
function syncBtns() { var st = $("#chstop"), sd = $("#chsend"); if (!st) return; var busy = !!tab().busy; st.hidden = !busy; sd.disabled = busy; }
function paintTabs() { var e = $("#chtabs"); if (!e) return;
  e.innerHTML = CH.tabs.map(function (t, i) { return "<button class='chtab" + (i === CH.cur ? " on" : "") + (t.busy ? " live" : "") + "' role='tab' aria-selected='" + (i === CH.cur) + "' data-t='" + i + "' title='" + esc(t.title) + (t.busy ? " (streaming)" : "") + "'><span>" + esc(t.title) + "</span>" + (CH.tabs.length > 1 ? "<i data-x='" + i + "' title='Close this conversation' aria-label='Close'>✕</i>" : "") + "</button>"; }).join("") +
    (CH.tabs.length < CHMAX ? "<button class='chtab add' id='chadd' title='New conversation (" + CH.tabs.length + " of " + CHMAX + ")' aria-label='New conversation'>＋</button>" : "");
  e.onclick = function (ev) { var x = ev.target.closest("[data-x]"), t = ev.target.closest("[data-t]");
    if (x) { var i = +x.dataset.x, T = CH.tabs[i]; if (T.busy) T.busy.abort(); CH.tabs.splice(i, 1); if (CH.cur >= i && CH.cur > 0) CH.cur--; saveTabs(); paintChat(); return; }
    if (ev.target.closest("#chadd")) { if (CH.tabs.length < CHMAX) { CH.tabs.push(newTab()); CH.cur = CH.tabs.length - 1; saveTabs(); paintChat(); var i2 = $("#chin"); if (i2) i2.focus(); } return; }
    if (t) { CH.cur = +t.dataset.t; saveTabs(); paintChat(); } }; }
function md(s) { s = esc(s); s = s.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, l, c) { return "<pre class='code'>" + c + "</pre>"; });
  return s.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
function apiMessages(msgs) { return msgs.filter(function (m) { return !m.pending || m.text; }).map(function (m) {
  var t = m.text; (m.files || []).forEach(function (f) { t += "\n\n--- " + f.name + " ---\n" + f.text; }); return {role: m.role, content: t}; }); }
function paintChat() { paintTabs(); var box = $("#chlog"); if (!box) return; var M = tab().msgs; syncBtns();
  box.innerHTML = M.length ? M.map(function (m) { return "<div class='msg " + m.role + "'><div class='who'>" + (m.role === "user" ? "You" : "Strata") + (m.stats ? " <small>" + esc(m.stats) + "</small>" : "") + "</div>" +
    (m.reasoning && CH.set.show ? "<details class='think' " + (m.pending && !m.text ? "open" : "") + "><summary>Thinking (" + m.reasoning.length + " chars)</summary><div>" + md(m.reasoning) + "</div></details>" : "") +
    (m.tools || []).map(function (t) { return "<div class='tool'>🔧 " + esc(JSON.stringify(t).slice(0, 300)) + "</div>"; }).join("") +
    (m.files && m.files.length ? "<div class='tool'>📎 " + m.files.map(function (f) { return esc(f.name); }).join(", ") + "</div>" : "") +
    "<div class='txt'>" + (m.text ? md(m.text) : m.pending ? "<span class='na'>" + esc(m.phase || "waiting…") + "</span>" : "") + "</div>" + (m.note ? "<div class='tool'>" + esc(m.note) + "</div>" : "") + (m.error ? "<div class='st err'>" + esc(m.error) + "</div>" : "") + "</div>"; }).join("")
    : "<div class='w-unavail' style='height:100%'>Start a conversation with " + esc((S.D.vs || {}).model || "the model") + "</div>";
  box.scrollTop = box.scrollHeight; }
R.chatbox = function (b) {
  b.innerHTML = "<div class='chat'><div class='chtabs' id='chtabs' role='tablist'></div><div class='chlog' id='chlog'></div><div class='chfiles' id='chfiles'></div><div class='composer'><textarea id='chin' rows='2' placeholder='Ask anything…  (Enter sends, Shift+Enter new line)'></textarea>" +
    "<div class='chbtns'><button class='btn sec' id='chattach' title='Attach text files'>📎</button><input type='file' id='chfile' multiple hidden><button class='btn sec' id='chexp' title='Save as Markdown'>⤓</button>" +
    "<button class='btn' id='chstop' hidden>■ Stop</button><button class='btn' id='chsend'>Send ➤</button></div></div></div>";
  paintChat(); paintFiles();
  $("#chin").onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  $("#chsend").onclick = send; $("#chstop").onclick = function () { if (tab().busy) tab().busy.abort(); };
  $("#chattach").onclick = function () { $("#chfile").click(); }; $("#chfile").onchange = function () { addFiles(this.files); this.value = ""; };
  b.ondragover = function (e) { e.preventDefault(); }; b.ondrop = function (e) { e.preventDefault(); addFiles(e.dataTransfer.files); };
  $("#chexp").onclick = function () { var t = "# Strata chat\n\n" + tab().msgs.map(function (m) { return "## " + (m.role === "user" ? "You" : "Strata") + "\n\n" + (m.reasoning ? "<details><summary>Thinking</summary>\n\n" + m.reasoning + "\n\n</details>\n\n" : "") + m.text; }).join("\n\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], {type: "text/markdown"})); a.download = "strata-chat.md"; a.click(); };
  if (S.D.health && S.D.health.images === false) $("#chattach").title = "Attach text files (this model has no image input)";
};
function addFiles(list) { Array.prototype.forEach.call(list, function (f) { if (f.size > 4e6) return toast(f.name + ": larger than 4 MB", true); f.text().then(function (t) { CH.files.push({name: f.name, text: t}); paintFiles(); }); }); }
function paintFiles() { var e = $("#chfiles"); if (e) e.innerHTML = CH.files.map(function (f, i) { return "<span class='chip'>📎 " + esc(f.name) + " <a data-i='" + i + "'>✕</a></span>"; }).join("");
  if (e) e.onclick = function (ev) { if (ev.target.dataset.i) { CH.files.splice(+ev.target.dataset.i, 1); paintFiles(); } }; }
function send() {
  var T = tab(), inp = $("#chin"), text = inp.value.trim(); if ((!text && !CH.files.length) || T.busy) return;
  T.msgs.push({role: "user", text: text, files: CH.files}); CH.files = []; paintFiles(); inp.value = "";
  if (!T.named && text) { T.title = text.slice(0, 18); T.named = true; }
  var m = {role: "assistant", text: "", reasoning: "", pending: true, tools: []}; T.msgs.push(m); paintChat();
  var s = CH.set, body = {model: (S.D.health || {}).model || (S.D.vs || {}).model, messages: apiMessages(T.msgs), stream: true, reasoning_effort: s.thinking};
  if (+s.temperature > 0) { body.temperature = +s.temperature; body.top_p = +s.top_p; body.top_k = +s.top_k; } else body.temperature = 0;
  if (s.seed) body.seed = +s.seed; if (s.max) body.max_tokens = +s.max;
  var e = (S.D.m || {}).engine || {}; if (e.cvec && e.cvec !== "0") body.experimental_speed_projection = !!s.esp;
  if (s.mcp !== false && S.D.mcp && S.D.mcp.tools > 0) body.strata_mcp = true;
  var ctl = new AbortController(); T.busy = ctl; syncBtns();
  var t0 = performance.now(), first = null, usage = null, frame = 0, finish = null;
  var phaseTimer = setInterval(function () { if (!m.text && S.D.st) { m.phase = S.D.st.phase || "waiting…"; if (T === tab()) paintChat(); } }, 1000);
  fetch("/strata/v1/chat/completions", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: ctl.signal}).then(function (r) {
    if (!r.ok) return r.json().then(function (j) { throw new Error((j.error && j.error.message) || ("HTTP " + r.status)); }, function () { throw new Error("HTTP " + r.status); });
    if ((r.headers.get("Content-Type") || "").indexOf("event-stream") < 0) return r.json().then(function (j) {  /* server answered without streaming */
      var c = (j.choices && j.choices[0]) || {}, msg = c.message || {}; if (j.error) throw new Error(j.error.message || "engine error"); usage = j.usage || null; finish = c.finish_reason;
      m.reasoning = msg.reasoning_content || ""; m.text = msg.content || ""; });
    var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
    function pump() { return rd.read().then(function (x) { if (x.done) buf += dec.decode() + "\n"; else buf += dec.decode(x.value, {stream: true}); var nl;
      while ((nl = buf.indexOf("\n")) >= 0) { var line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line.indexOf("data:") !== 0) continue; var d = line.slice(5).trim(); if (d === "[DONE]") continue;
        var j; try { j = JSON.parse(d); } catch (e2) { continue; } if (j.error) throw new Error(j.error.message || "engine error"); if (j.usage) usage = j.usage; if (j.strata_mcp) m.tools.push(j.strata_mcp);
        var dl = (j.choices && j.choices[0] && j.choices[0].delta) || {}; if ((dl.reasoning_content || dl.content) && first == null) first = performance.now(); if (j.choices && j.choices[0] && j.choices[0].finish_reason) finish = j.choices[0].finish_reason;
        if (dl.reasoning_content) m.reasoning += dl.reasoning_content; if (dl.content) m.text += dl.content; } if (x.done) return;
      if (!frame) frame = requestAnimationFrame(function () { frame = 0; if (T === tab()) paintChat(); }); return pump(); }); }
    return pump();
  }).catch(function (e) { if (e.name !== "AbortError") m.error = String(e.message || e); else m.error = "stopped"; }).then(function () {
    clearInterval(phaseTimer); m.pending = false; T.busy = null;
    /* the model can finish with reasoning_content only (content null/empty): never leave an empty bubble */
    if (!m.text && !m.error) { if (m.reasoning) { m.text = m.reasoning; m.note = "The model gave no separate answer" + (finish === "length" ? " (hit the max-tokens limit while thinking)" : "") + "; showing its reasoning as the reply."; }
      else m.error = "Empty reply from the model" + (finish ? " (finish_reason: " + finish + ")" : ""); } var secs = (performance.now() - t0) / 1000;
    m.stats = (usage ? usage.completion_tokens + " tokens · " + (usage.completion_tokens / Math.max(.01, secs - ((first || t0) - t0) / 1000)).toFixed(1) + " tok/s · " : "") + secs.toFixed(1) + "s";
    saveTabs(); paintChat(); });
}
R.chatset = function (b) { var s = CH.set, e = (S.D.m || {}).engine || {}, esp = e.cvec && e.cvec !== "0";
  b.className = "cb scroll"; b.innerHTML = "<div class='form'><label>Thinking</label><div class='seg' id='cs-th'>" + ["none", "low", "medium", "high"].map(function (x) { return "<button data-v='" + x + "' class='" + (s.thinking === x ? "on" : "") + "'>" + x + "</button>"; }).join("") + "</div>" +
    "<label>Temperature <b id='o-t'></b></label><input type='range' id='cs-t' min='0' max='1.5' step='0.05' value='" + s.temperature + "'>" +
    "<label>top_p <b id='o-p'></b></label><input type='range' id='cs-p' min='0.05' max='1' step='0.05' value='" + s.top_p + "'>" +
    "<label>top_k <b id='o-k'></b></label><input type='range' id='cs-k' min='1' max='64' step='1' value='" + s.top_k + "'>" +
    "<label>Max tokens</label><input class='f' type='number' id='cs-max' min='1' placeholder='Until done' value='" + esc(s.max) + "'><label>Seed</label><input class='f' type='number' id='cs-seed' min='1' placeholder='Random' value='" + esc(s.seed) + "'>" +
    tog("cs-show", "Show thinking", s.show) + tog("cs-mcp", "Use tools from MCP servers" + (S.D.mcp && S.D.mcp.tools ? "" : " (none configured)"), s.mcp !== false) + (esp ? tog("cs-esp", "Experimental speed projection", s.esp !== false) : "<p class='na' style='font-size:11px'>Experimental speed projection: unavailable (not loaded)</p>") +
    tog("cs-share", "Use for other apps too (server-wide defaults)", !!(S.D.settings && S.D.settings.shared)) +
    "<div style='display:flex;gap:8px;margin-top:10px'><button class='btn sec' id='cs-reset'>Reset</button><button class='btn' id='cs-apply'>Apply</button></div><p id='cs-msg' class='na' style='font-size:11px'></p></div>";
  function out() { var t = +$("#cs-t").value; $("#o-t").textContent = t === 0 ? "0 · greedy" : t.toFixed(2); $("#o-p").textContent = (+$("#cs-p").value).toFixed(2); $("#o-k").textContent = $("#cs-k").value; $("#cs-p").disabled = $("#cs-k").disabled = t === 0; }
  ["cs-t", "cs-p", "cs-k"].forEach(function (i) { $("#" + i).oninput = out; }); out();
  $("#cs-th").onclick = function (ev) { if (ev.target.dataset.v) { [].forEach.call(this.children, function (c) { c.classList.toggle("on", c === ev.target); }); } };
  b.querySelectorAll(".tg").forEach(function (t) { t.onclick = function () { t.classList.toggle("on"); }; });
  $("#cs-reset").onclick = function () { CH.set = {thinking: "high", temperature: 0, top_p: 0.95, top_k: 20, max: "", seed: "", show: true, mcp: true, esp: true}; delete b.dataset.drawn; R.chatset(b); b.dataset.drawn = 1; };
  $("#cs-apply").onclick = function () { var on = function (i) { var x = $("#" + i); return x ? x.classList.contains("on") : true; }; var th = b.querySelector("#cs-th .on");
    CH.set = {thinking: th ? th.dataset.v : "high", temperature: +$("#cs-t").value, top_p: +$("#cs-p").value, top_k: +$("#cs-k").value, max: $("#cs-max").value, seed: $("#cs-seed").value, show: on("cs-show"), mcp: on("cs-mcp"), esp: on("cs-esp")};
    localStorage.setItem("sm.chat", JSON.stringify(CH.set)); paintChat(); var share = on("cs-share"), was = !!(S.D.settings && S.D.settings.shared), c = CH.set;
    if ((share || was) && !confirm(share ? "Save these sampling settings as Strata's shared defaults for EVERY app (POST /settings)?" : "Turn off Strata's shared defaults for every app (POST /settings)?")) { $("#cs-msg").textContent = "Applied to this chat only; Strata settings unchanged."; return; }
    if (share || was) { var d = {reasoning_effort: c.thinking, temperature: c.temperature}; if (c.temperature > 0) { d.top_p = c.top_p; d.top_k = c.top_k; } if (c.seed) d.seed = +c.seed; if (c.max) d.max_tokens = +c.max;
      post("/settings", {defaults: share ? d : null}).then(function (j) { S.D.settings = j; $("#cs-msg").textContent = share ? "Applied, and saved as every app's defaults." : "Applied; shared defaults turned off."; }, function (e) { toast("Shared defaults not saved: " + e.message, true); });
    } else $("#cs-msg").textContent = "Applied to this chat."; };
};
function tog(id, label, on) { return "<div class='tgrow'><span>" + label + "</span><button class='tg " + (on ? "on" : "") + "' id='" + id + "' role='switch'></button></div>"; }

/* ---------------- control & health ---------------- */
function kv(rows) { return '<div class="kv">' + rows.map(function (r) { return "<span>" + r[0] + "</span><b>" + (r[1] === undefined || r[1] === null || r[1] === "" ? NA : esc(String(r[1]))) + "</b>"; }).join("") + "</div>"; }
R.health = function (b) { var h = S.D.health || {}, vs = S.D.vs || {}, m = vs.machine || {}; b.className = "cb scroll";
  b.innerHTML = "<div style='display:flex;gap:8px;align-items:center;margin-bottom:8px'><span class='st " + (h.status === "ok" ? "ok" : "err") + "'>" + esc(h.status || "unreachable") + "</span><span class='st " + (h.loaded ? "ready" : "idle") + "'>" + (h.loaded ? "loaded" : "not loaded") + "</span></div>" +
    kv([["Service", h.service], ["Model", h.model], ["Max context", h.max_context], ["Images", h.images], ["API key required", h.api_key], ["Engine", vs.engine], ["Started", vs.started ? new Date(vs.started * 1000).toLocaleString() : null], ["Uptime", ok(vs.uptime_s) ? S.dur(vs.uptime_s) : null],
      ["Requests served", (vs.activity || {}).requests], ["Last request", (vs.activity || {}).last_request_at ? S.ago(vs.activity.last_request_at) + " ago" : null], ["GPU", (m.gpu || {}).name], ["RAM", m.ram ? m.ram.used_gib + " / " + m.ram.total_gib + " GiB" : null],
      ["CPU", ((S.D.m || {}).hardware_static || {}).cpu_name], ["Endpoint", (S.D.info || {}).strata]]) +
    "<p style='font-size:11px;color:var(--mu)'>Connect your tools: OpenAI <code>" + esc(((S.D.info || {}).strata || "") + "/v1") + "</code> · Anthropic <code>/v1/messages</code> · Responses <code>/v1/responses</code> · <a href='https://github.com/Niko1221/Strata' target='_blank' rel='noopener' style='color:var(--cy)'>Strata on GitHub</a></p>"; };
R.lifecycle = function (b) { b.innerHTML = "<div id='lcstate'></div><div style='display:flex;gap:8px;margin:10px 0'><button class='btn' id='lcload'>Load model</button><button class='btn sec' id='lcunload'>Unload model</button></div>" +
    "<label style='font-size:11px;color:var(--mu)'>VRAM reserve for other programs (MiB; empty = the start's value)</label><div style='display:flex;gap:8px;margin-top:4px'><input class='f' type='number' min='0' id='lcvram' placeholder='start value'><button class='btn sec' id='lcvset'>Set</button></div><p id='lcmsg' class='na' style='font-size:11px'></p>";
  R.lifecycleLive(b);
  $("#lcload").onclick = function () { confirmDo("Load the model?", "Strata loads the model now (it takes the GPUs). Same call as Strata's own page: POST /load.", function () { $("#lcmsg").textContent = "Loading…"; post("/load").then(function (j) { $("#lcmsg").textContent = "Status: " + j.status; }, function (e) { toast("Load failed: " + e.message, true); $("#lcmsg").textContent = ""; }); }); };
  $("#lcunload").onclick = function () { confirmDo("Unload the model?", "This frees the GPUs. Strata refuses while a request runs (409 busy); the next request loads it again if auto-load is on. POST /unload.", function () { post("/unload").then(function (j) { $("#lcmsg").textContent = "Status: " + j.status; }, function (e) { toast("Unload: " + e.message, true); }); }); };
  $("#lcvset").onclick = function () { var x = $("#lcvram").value.trim(), val = x === "" ? null : parseInt(x, 10);
    confirmDo("Change the VRAM reserve?", "Strata gives back or takes VRAM now (reserve_mib = " + (val === null ? "start value" : val) + "). POST /v1/vram.", function () { post("/v1/vram", {reserve_mib: val}).then(function (j) { $("#lcmsg").textContent = "VRAM: " + JSON.stringify(j).slice(0, 200); }, function (e) { toast("VRAM: " + e.message, true); }); }); }; };
R.lifecycleLive = function (b) { var vs = S.D.vs || {}, a = vs.activity || {}; var e = $("#lcstate"); if (e) e.innerHTML = kv([["State", vs.loaded ? (a.in_flight ? "in use (" + a.in_flight + " active)" : "loaded") : vs.loaded === false ? "unloaded" : null], ["Auto-load", vs.auto_load], ["VRAM elastic", (vs.vram || {}).elastic], ["VRAM free", ok(((S.D.m || {}).engine || {}).vram_free_mib) ? S.D.m.engine.vram_free_mib + " MiB" : null]]); };
R.runcfg = function (b) { var c = S.D.cfg; b.className = "cb"; b.dataset.nofit = 1; b.dataset.fit = 15; b.dataset.min = 8;
  if (!c) { b.innerHTML = "<div class='w-unavail'>unavailable — this server has no run config or did not answer /config</div>"; b.dataset.retry = 1; return; }
  delete b.dataset.retry;
  b.innerHTML = "<div class='fit-in cfgwrap'><p class='cfgnote'>File <code>" + esc(c.file || "") + "</code>. Empty = Strata's default. Saving writes the file (Strata keeps a .bak); start the model again to use it.</p><div class='cfgform'>" + c.keys.map(function (k, i) { var val = k.value, inp;
    if (k.kind === "bool" || k.kind === "enum") { var opts = k.kind === "bool" ? [["true", "on"], ["false", "off"]] : (k.choices || []).map(function (x) { return [x, x]; }); var cur = val == null ? "" : String(val);
      inp = "<select class='f' id='cf" + i + "'><option value=''>default</option>" + opts.map(function (o) { return "<option value='" + esc(o[0]) + "'" + (cur === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; }
    else inp = "<input class='f' id='cf" + i + "' " + (k.kind === "number" ? "type='number' step='any' min='0'" : "type='text'") + " value='" + esc(val == null ? "" : Array.isArray(val) ? val.join(", ") : String(val)) + "' placeholder='default'>";
    return "<div class='cff'><label for='cf" + i + "' title='" + esc(k.help || "") + "'><code>" + esc(k.key) + "</code><small>" + esc(k.help || "") + "</small></label>" + inp + "</div>"; }).join("") + "</div><div class='cfgbar'><button class='btn' id='cfsave'>Save model settings</button> <span id='cfmsg' class='na'></span></div></div>";
  setTimeout(function () { S.fitOne(b); }, 0);
  $("#cfsave").onclick = function () { var set = {};
    c.keys.forEach(function (k, i) { var el = $("#cf" + i), s = el.value.trim(), nv = s === "" ? null : k.kind === "bool" ? s === "true" : k.kind === "number" ? Number(s) : s; var old = Array.isArray(k.value) ? k.value.join(", ") : k.value;
      if (JSON.stringify(nv) !== JSON.stringify(old == null ? null : old)) set[k.key] = nv; });
    var keys = Object.keys(set); if (!keys.length) { $("#cfmsg").textContent = "Nothing changed."; return; }
    confirmDo("Save model settings?", "Writes " + keys.map(esc).join(", ") + " to " + esc(c.file || "the run config") + " via POST /config. Strata keeps the earlier file as .bak.", function () {
      post("/config", {set: set}).then(function (j) { $("#cfmsg").textContent = j.changed && j.changed.length ? "Saved (" + j.changed.join(", ") + "); earlier file: " + j.file + ".bak. Start the model again to use it." : "Nothing changed.";
        S.get("/strata/config").then(function (cc) { S.D.cfg = cc; }); }, function (e) { toast("Not saved: " + e.message, true); }); }); }; };
R.slotsc = function (b) { var n = (S.D.props || {}).total_slots || (S.D.slots || []).length; if (n) delete b.dataset.retry; else b.dataset.retry = 1;
  b.innerHTML = "<p style='font-size:11px;color:var(--mu);margin-top:0'>Save a slot's conversation to a file in Strata's slot folder, or restore it. Restore replaces what the slot holds.</p><div class='form'><label>Slot</label><select class='f' id='slid'>" +
    (n ? Array.from({length: n}, function (_, i) { return "<option>" + i + "</option>"; }).join("") : "<option disabled>unavailable</option>") + "</select><label>File name</label><input class='f' id='slfn' placeholder='name.bin'></div><div style='display:flex;gap:8px;margin-top:10px'><button class='btn sec' id='slsave'>Save slot</button><button class='btn sec' id='slrest'>Restore slot</button></div><p id='slmsg' class='na' style='font-size:11px'></p>";
  function act(a) { var id = $("#slid").value, fn = $("#slfn").value.trim(); if (!fn) return toast("Enter a file name", true);
    confirmDo((a === "save" ? "Save" : "Restore") + " slot " + id + "?", a === "save" ? "Writes slot " + id + " to " + esc(fn) + " (overwrites a file of that name)." : "Replaces slot " + id + "'s conversation with " + esc(fn) + ".", function () {
      post("/slots/" + id + "?action=" + a, {filename: fn}).then(function (j) { $("#slmsg").textContent = a + ": " + JSON.stringify(j).slice(0, 200); }, function (e) { toast("Slot " + a + ": " + e.message, true); }); }); }
  $("#slsave").onclick = function () { act("save"); }; $("#slrest").onclick = function () { act("restore"); }; };
R.apilog = function (b) { b.className = "cb scroll"; S.get("/strata/api/requests").then(function (j) { var r = j.requests || j.records || [];
    b.innerHTML = r.length ? "<table><tr><th>ID</th><th>Endpoint</th><th>State</th></tr>" + r.slice(-40).reverse().map(function (x) { return "<tr><td><a data-id='" + esc(x.id) + "' style='color:var(--cy);cursor:pointer'>" + esc(String(x.id).slice(0, 10)) + "</a></td><td>" + esc(x.path || "") + "</td><td><span class='st " + esc(x.state || "") + "'>" + esc(x.state || "") + "</span></td></tr>"; }).join("") + "</table>" : "<span class='na'>no requests recorded</span>";
    b.onclick = function (e) { var id = e.target.dataset.id; if (id) S.get("/strata/api/requests?id=" + encodeURIComponent(id)).then(function (d) { S.modal("Request " + id, ["input", "output", "reasoning", "response"].map(function (k) { return "<h4>" + k + "</h4><pre style='max-height:200px;overflow:auto'>" + esc(typeof d[k] === "string" ? d[k] : JSON.stringify(d[k], null, 1) || "unavailable") + "</pre>"; }).join("") + S.esc(""));
    }); };
  }, function () { b.innerHTML = "<div class='w-unavail' style='height:auto;padding:14px'>unavailable — Strata's request monitor is off</div><p style='font-size:11px;color:var(--mu)'>Turn it on with the run-config key <code>api_monitor</code> (Model settings), then start the model again. Then each request's input, output, reasoning and response appear here.</p>"; }); };
};
