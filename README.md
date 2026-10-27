# NerdyTradeIntuition v2 — installable chart-practice app

Plain static files (no build step). Works on GitHub Pages, any static host, or `python3 -m http.server`.

## Put it on GitHub Pages
1. Create a repo (or use your existing one) and upload **everything in this folder** (keep the `js/` and `icons/` folders).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<you>.github.io/<repo>/` — done.

## Install as an app
- **Android / Chrome / Edge (desktop):** tap **Install** in the top bar (or browser menu → Install app).
- **iPhone / iPad (Safari):** Share → Add to Home Screen.
It then opens full-screen, with its own icon, and works offline.

## Your data
Trades, journal notes and settings live in this browser's local storage on this device only (key `nti2_*`).
They are per-browser and per-URL — use **Journal → Backup** to move them or keep a copy. Old v1 trades are migrated automatically on first open.

## Updating later
Replace the files, then bump `VERSION` in `sw.js` (e.g. `nti-v2-2`) so installed copies pick up the new version.

## Shortcuts
B buy · S sell · C close · V reverse · E stop→breakeven · P play/pause · + or ] faster · - or [ slower · Space or ↓ next symbol · ↑ previous symbol · ~ sort watchlist by % change (flips each press) · → step candle · ⇧→ next session · R restart · N new chart
[ ] speed · 1–9 timeframes · H naked price · T theme · M measure · L horizontal line · Esc cursor
