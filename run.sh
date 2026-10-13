#!/bin/sh
# Start Strata Monitor with the settings install.sh saved (strata-monitor.json), or defaults.
cd "$(dirname "$0")"
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then exec "$c" strata_monitor.py --config strata-monitor.json "$@"; fi
done
echo "Python 3.8 or newer is needed"; exit 1
