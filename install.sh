#!/bin/sh
# Strata Monitor: configure (writes strata-monitor.env). Start it afterwards with ./run.sh.
# Needs Python 3.8+ only (standard library). Nothing is installed system-wide.
#   STRATA_URL=http://127.0.0.1:8080 STRATA_API_KEY=yourkey STRATA_DIR=/path/to/Strata PORT=8090 ./install.sh
set -e
cd "$(dirname "$0")"
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "Python 3.8 or newer is needed"; exit 1; }
: "${STRATA_URL:=http://127.0.0.1:8080}"; : "${PORT:=8090}"
if [ -z "$STRATA_DIR" ]; then for d in "$HOME/Strata-main" "$HOME/Strata" "$(pwd)/../Strata-main"; do [ -f "$d/setup.py" ] && STRATA_DIR="$d" && break; done; fi
umask 077
# JSON, not shell: values with spaces or symbols are stored safely and never executed
"$PY" - "$STRATA_URL" "${STRATA_API_KEY:-}" "${STRATA_DIR:-}" "$PORT" "$PY" <<'PYEOF'
import json, sys
u, k, d, p, py = sys.argv[1:6]
json.dump({"strata": u, "key": k, "strata_dir": d, "port": int(p), "python": py}, open("strata-monitor.json", "w"), indent=1)
PYEOF
chmod 600 strata-monitor.json
echo "Saved settings to strata-monitor.json. Start it with ./run.sh, then open http://127.0.0.1:$PORT/"
