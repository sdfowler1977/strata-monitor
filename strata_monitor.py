#!/usr/bin/env python3
"""Strata Monitor - a read-only dashboard for a running Strata server.

Serves the web UI and forwards Strata's read endpoints, plus only the write calls Strata's own pages make
(chat, model settings, shared defaults, load/unload, VRAM reserve, slot save/restore), each from a user action. It keeps a rolling in-memory history
so charts can show trends, runs Strata's own PC check (setup.py --check) on request, and builds a GitHub issue
PREVIEW. It never posts anything: the user opens the prefilled GitHub page and submits it there themselves.

    STRATA_API_KEY=YOURKEY python3 strata_monitor.py --strata-url http://127.0.0.1:8080 --strata-dir /path/to/Strata --port 8090
    (or: ./install.sh once, then ./run.sh)
Standard library only (Python 3.8+).
"""
import argparse, json, os, secrets, urllib.error, subprocess, sys, threading, time, urllib.parse, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
ALLOWED = {"/health", "/status", "/v1/status", "/slots", "/props", "/metrics", "/metrics/prometheus", "/config",
           "/settings", "/mcp", "/v1/models", "/api/requests"}
# Writes the GUI may forward: exactly the calls Strata's own pages make (chat, run config, shared defaults,
# load/unload, VRAM reserve, slot save/restore). The UI confirms the destructive ones before sending.
WRITES = {"/v1/chat/completions", "/config", "/settings", "/load", "/unload", "/v1/load", "/v1/unload", "/v1/vram"}
REPO = "Niko1221/Strata"
TOKEN = secrets.token_urlsafe(24)  # per-run anti-CSRF token: only the page this server served knows it
HIST_MAX = 1440  # samples (default every 2 s -> 48 min; the UI also shows Strata's own 60-sample history)


class State:
    def __init__(self, a):
        self.a = a
        self.lock = threading.Lock()
        self.hist = []          # [{t, gpus:[{util,temp,power,mem_used,mem_total}], queue, waiting, running, tok_s, ...}]
        self.diag = None
        self.diag_running = False
        self.last_error = None

    def fetch(self, path, raw=False):
        req = urllib.request.Request(self.a.strata.rstrip("/") + path, method="GET")
        if self.a.key:
            req.add_header("Authorization", "Bearer " + self.a.key)
        with urllib.request.urlopen(req, timeout=5) as r:
            body = r.read()
        return body if raw else json.loads(body)


def sampler(st):
    while True:
        try:
            m = st.fetch("/metrics")
            try:
                s = st.fetch("/status")
            except Exception:
                s = {}
            live, hw = m.get("live") or {}, m.get("hardware") or {}
            slots = live.get("slots") or []
            row = {"t": time.time(),
                   "gpus": [{k: g.get(k) for k in ("index", "util", "temp", "power", "mem_used", "mem_total")} for g in hw.get("gpus") or []],
                   "queued": live.get("queued"), "waiting": live.get("waiting"), "admitting": live.get("admitting"),
                   "running": live.get("running"), "parallel": live.get("parallel"), "outside_slots": live.get("outside_slots"),
                   "tok_s": live.get("tok_s"), "prefill": live.get("prefill_tok_s_mean"), "cpu": hw.get("cpu"),
                   "ram_used": hw.get("ram_used"), "ram_total": hw.get("ram_total"), "pcie_rx": hw.get("gpu_pcie_rx_mb"),
                   "pcie_tx": hw.get("gpu_pcie_tx_mb"), "state": live.get("state"), "phase": live.get("phase") or s.get("phase"),
                   "slot_states": [x.get("state") for x in slots], "ok": True,
                   "drafts_off": (m.get("totals") or {}).get("drafts_offered"), "drafts_acc": (m.get("totals") or {}).get("drafts_accepted"),
                   "reused": (m.get("totals") or {}).get("reused"), "prompt_tok": (m.get("totals") or {}).get("prompt_tokens")}
            st.last_error = None
        except Exception as e:  # Strata unreachable: record the gap, never invent values
            row = {"t": time.time(), "ok": False}
            st.last_error = str(e)
        with st.lock:
            st.hist.append(row)
            del st.hist[:-HIST_MAX]
        time.sleep(st.a.interval)


def run_diag(st):
    sd = st.a.strata_dir
    script = os.path.join(sd, "setup.py") if sd else None
    out = {"started": time.time(), "command": None, "output": "", "rc": None, "snapshot": {}}
    try:
        if not script or not os.path.isfile(script):
            out["output"] = "unavailable: Strata's setup.py was not found (pass --strata-dir)"
        else:
            cmd = [sys.executable, script, "--check", "--yes"]
            out["command"] = "python3 setup.py --check --yes"
            p = subprocess.run(cmd, cwd=sd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300)
            out["rc"], out["output"] = p.returncode, (p.stdout + p.stderr)[-20000:]
        for path in ("/health", "/v1/status", "/metrics"):
            try:
                d = st.fetch(path)
                if path == "/metrics":
                    d = {k: d.get(k) for k in ("engine", "live", "totals", "hardware", "hardware_static", "conversation_cache")}
                out["snapshot"][path] = d
            except Exception as e:
                out["snapshot"][path] = "unavailable: %s" % e
    except Exception as e:
        out["output"] += "\nerror: %s" % e
    out["finished"] = time.time()
    with st.lock:
        st.diag, st.diag_running = out, False


GPU_Q = "index,name,pcie.link.gen.current,pcie.link.gen.max,pcie.link.width.current,pcie.link.width.max,clocks.sm,clocks.mem,fan.speed,power.limit,temperature.memory"


def gpu_direct():
    """Per-GPU readings straight from the driver tool (nvidia-smi), for what Strata does not report (per-GPU PCIe
    link, clocks, fan). Missing tool or field -> None; nothing is estimated."""
    out = {"source": None, "gpus": []}
    try:
        p = subprocess.run(["nvidia-smi", "--query-gpu=" + GPU_Q, "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=5)
        if p.returncode == 0:
            out["source"] = "nvidia-smi"
            keys = ["index", "name", "pcie_gen", "pcie_gen_max", "pcie_width", "pcie_width_max", "clock_sm", "clock_mem", "fan", "power_limit", "mem_temp"]
            for line in p.stdout.strip().splitlines():
                vals = [x.strip() for x in line.split(",")]
                row = {}
                for k, v in zip(keys, vals):
                    try:
                        row[k] = float(v) if k not in ("name",) else v
                    except ValueError:
                        row[k] = None
                row["index"] = int(row["index"]) if row.get("index") is not None else None
                out["gpus"].append(row)
            q = subprocess.run(["nvidia-smi", "dmon", "-s", "t", "-c", "1"], capture_output=True, text=True, timeout=5)
            for line in q.stdout.splitlines():
                f = line.split()
                if f and f[0].isdigit():
                    for g in out["gpus"]:
                        if g["index"] == int(f[0]):
                            try:
                                g["pcie_rx_kbs"], g["pcie_tx_kbs"] = float(f[1]) * 1024, float(f[2]) * 1024
                            except (ValueError, IndexError):
                                pass
    except (OSError, subprocess.SubprocessError):
        pass
    return out


def issue_preview(st, body):
    d = st.diag or {}
    snap = d.get("snapshot") or {}
    vs = snap.get("/v1/status") if isinstance(snap.get("/v1/status"), dict) else {}
    hs = ((snap.get("/metrics") or {}) if isinstance(snap.get("/metrics"), dict) else {}).get("hardware_static") or {}
    ver = vs.get("engine", "unavailable")
    gpu = hs.get("gpu_name", "unavailable")
    title = body.get("title") or "[Bug]: "
    if not title.startswith("["):
        title = "[Bug]: " + title
    text = ("### What happened\n\n%s\n\n### Strata version, GPU, OS\n\n%s · %s · %s\n\n### Diagnostics (setup.py --check)\n\n```\n%s\n```\n\n"
            "<details><summary>Server snapshot at diagnosis time</summary>\n\n```json\n%s\n```\n</details>\n\n_Submitted from Strata Monitor after preview._\n") % (
        body.get("description", "").strip() or "(no description)", ver, gpu, sys.platform,
        (d.get("output") or "diagnostics not run").strip()[-6000:], json.dumps(snap, indent=1, default=str)[:12000])
    kind = body.get("kind", "issue")
    url_body = text if len(text) < 6000 else text[:5800] + "\n\n(trimmed - paste the full preview from Strata Monitor)\n"
    url = "https://github.com/%s/issues/new?%s" % (REPO, urllib.parse.urlencode({"title": title, "body": url_body, "labels": "bug"}))
    if kind == "pr":
        url = "https://github.com/%s/compare" % REPO
    return {"title": title, "body": text, "url": url, "kind": kind, "repo": REPO}


class H(BaseHTTPRequestHandler):
    st = None

    def log_message(self, *a):
        pass

    def send(self, code, data, ctype="application/json"):
        if not isinstance(data, (bytes, bytearray)):
            data = json.dumps(data, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path = p.path
        if path.startswith("/strata/"):
            sp = path[len("/strata"):]
            if sp not in ALLOWED and not (sp == "/metrics" and p.query):
                return self.send(403, {"error": "not an allowed read endpoint"})
            try:
                raw = self.st.fetch(sp + ("?" + p.query if p.query else ""), raw=True)
                return self.send(200, raw, "text/plain" if sp == "/metrics/prometheus" else "application/json")
            except Exception as e:
                return self.send(502, {"error": "unavailable", "detail": str(e)})
        if path == "/monitor/history":
            with self.st.lock:
                return self.send(200, {"interval": self.st.a.interval, "samples": self.st.hist[-int(urllib.parse.parse_qs(p.query).get("n", ["900"])[0]):]})
        if path == "/monitor/info":
            sd = self.st.a.strata_dir
            packs = []
            for cand in [os.path.join(os.path.dirname(sd or "."), "Strata-data", "packs"), os.path.join(sd or ".", "..", "Strata-data", "packs")]:
                if os.path.isdir(cand):
                    packs = sorted(os.listdir(cand)); break
            return self.send(200, {"strata": self.st.a.strata, "strata_dir": sd, "installed_packs": packs or None,
                                   "replicas": None, "last_error": self.st.last_error, "repo": REPO})
        if path == "/monitor/gpu":
            return self.send(200, gpu_direct())
        if path == "/monitor/diag":
            return self.send(200, {"running": self.st.diag_running, "result": self.st.diag})
        f = os.path.normpath(os.path.join(WEB, path.lstrip("/") or "index.html"))
        if not f.startswith(WEB) or not os.path.isfile(f):
            f = os.path.join(WEB, "index.html")
        ct = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml"}.get(os.path.splitext(f)[1], "application/octet-stream")
        with open(f, "rb") as fh:
            data = fh.read()
        if f.endswith(".html"):
            data = data.replace(b"__MONITOR_TOKEN__", TOKEN.encode())
        self.send(200, data, ct)

    def foreign(self):
        """CSRF guard for EVERY POST: JSON only, the per-run token the served page carries, and (when the browser
        sends one) an Origin whose scheme://host:port is exactly this server."""
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return 415, "send application/json"
        if not secrets.compare_digest(self.headers.get("X-Monitor-Token", ""), TOKEN):
            return 403, "missing or wrong monitor token (reload the Strata Monitor page)"
        o = self.headers.get("Origin")
        if o:
            u = urllib.parse.urlparse(o)
            if u.scheme != "http" or u.netloc != self.headers.get("Host"):
                return 403, "writes only from Strata Monitor's own page"
        return None

    def forward_write(self, sp, query, body):
        req = urllib.request.Request(self.st.a.strata.rstrip("/") + sp + ("?" + query if query else ""), data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.st.a.key:
            req.add_header("Authorization", "Bearer " + self.st.a.key)
        try:
            r = urllib.request.urlopen(req, timeout=None if sp == "/v1/chat/completions" else 600)
        except urllib.error.HTTPError as e:
            return self.send(e.code, e.read() or b"{}")
        except Exception as e:
            return self.send(502, {"error": {"message": "Strata unavailable: %s" % e}})
        ctype = r.headers.get("Content-Type", "application/json")
        self.send_response(r.status)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        if "event-stream" in ctype:  # stream chat tokens through as they arrive
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                while True:
                    chunk = r.read1(65536) if hasattr(r, "read1") else r.read(1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass  # the user pressed Stop: closing our side ends Strata's stream too
            finally:
                r.close()
            return
        data = r.read()
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        u = urllib.parse.urlparse(self.path)
        why = self.foreign()
        if why:
            return self.send(why[0], {"error": {"message": why[1]}})
        raw = self.rfile.read(n) if n else b"{}"
        try:
            body = json.loads(raw or b"{}")
            if not isinstance(body, dict):
                raise ValueError("send a JSON object")
        except ValueError as e:
            return self.send(400, {"error": {"code": "bad_json", "message": "body is not a JSON object: %s" % e}})
        if u.path.startswith("/strata/"):
            sp = u.path[len("/strata"):]
            if sp not in WRITES and not (sp.startswith("/slots/") and sp[7:].isdigit()):
                return self.send(403, {"error": {"message": "not a write Strata's own pages make"}})
            return self.forward_write(sp, u.query, raw)
        if self.path == "/monitor/diag/run":
            with self.st.lock:
                if self.st.diag_running:
                    return self.send(409, {"error": "already running"})
                self.st.diag_running = True
            threading.Thread(target=run_diag, args=(self.st,), daemon=True).start()
            return self.send(202, {"started": True})
        if self.path == "/monitor/issue/preview":
            return self.send(200, issue_preview(self.st, body))
        self.send(404, {"error": "not found"})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--strata-url", "--strata", dest="strata", default=os.environ.get("STRATA_URL", "http://127.0.0.1:8080"),
                    help="Strata base URL (env STRATA_URL, default http://127.0.0.1:8080)")
    ap.add_argument("--key", default=os.environ.get("STRATA_API_KEY", ""),
                    help="Strata API key (required; or env STRATA_API_KEY)")
    ap.add_argument("--strata-dir", default=os.environ.get("STRATA_DIR", ""), help="Strata install folder (for diagnostics)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--config", help="JSON settings file written by install.sh (command-line flags win)")
    a = ap.parse_args()
    if a.config and os.path.isfile(a.config):
        c = json.load(open(a.config))
        given = {x.split("=")[0] for x in sys.argv[1:] if x.startswith("--")}
        if "--strata-url" in given:
            given.add("--strata")
        for k, flag in (("strata", "--strata"), ("key", "--key"), ("strata_dir", "--strata-dir"), ("port", "--port"), ("host", "--host")):
            if k in c and flag not in given:
                setattr(a, k, c[k])
    if not a.key:
        ap.error("a Strata API key is required: pass --key KEY or set STRATA_API_KEY")
    st = State(a)
    H.st = st
    threading.Thread(target=sampler, args=(st,), daemon=True).start()
    print("Strata Monitor on http://%s:%d  (watching %s)" % (a.host, a.port, a.strata), flush=True)
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()


if __name__ == "__main__":
    main()
