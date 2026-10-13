# Changelog

## v1.0.0 (2026-10-13)
First public release.
- Eight pages: Overview, GPU Fleet Lab, Request Flow, Performance Analytics, Strata Config, Chat, Control & Health, Diagnostics.
- Live charts from a rolling in-memory history; 14 themes; layouts that adapt to any number of GPUs.
- Confirmed write actions only (chat, model settings, load/unload, VRAM reserve, slot save/restore), with per-run CSRF token.
- Configuration via flags or env vars (`STRATA_API_KEY` required, `STRATA_URL` defaults to `http://127.0.0.1:8080`).
- Standard library only, Python 3.8+.
