# Capital Flow — biopharma M&A & fundraise dashboard

A static dashboard (GitHub Pages) fed by a manually-curated tracker. A nightly
GitHub Action rebuilds `data.json` from the source and the page redeploys.

## Files
- `build.py` — parses the trackers, cleans values (currency, dates, investors,
  source links) → `data.json`
- `index.html` — the dashboard; fetches `data.json` at load
- `dashboard_preview.html` — same dashboard with data embedded (opens with no
  server, for quick local viewing)
- `.github/workflows/refresh.yml` — nightly rebuild + commit
- `requirements.txt` — pandas, openpyxl

## Source of truth: Google Sheets (current setup)

`build.py` has `USE_SHEETS = True` and both "publish to web" document keys
filled in. The only thing it needs is one **gid per tab**, set in the `GID`
map near the top of `build.py`.

Find a gid: open the Sheet, click a tab, and read the number after `gid=` in
the address bar (`.../edit#gid=123456789`). Do that for all five tabs and drop
the numbers into `GID`.

Each tab is read from
`https://docs.google.com/spreadsheets/d/e/<PUBKEY>/pub?gid=<GID>&single=true&output=csv`.
No API key, no billing, no credit card. The reader auto-detects the header row,
so a blank first row is fine.

**Source-article links:** published CSV can't carry cell hyperlinks, so add a
plain column named `URL` (or `Source URL`) to each tab; `build.py` picks it up
automatically. Without it, the Source column just shows text.

To test locally instead, set `USE_SHEETS = False` — it reads the `.xlsx` files.

## One-time setup
1. New GitHub repo → add these files.
2. Settings → Pages → deploy from `main` / root.
3. Settings → Actions → allow workflows to write (`contents: write` is already
   in the workflow).
4. Actions tab → run **Refresh dashboard data** once to generate `data.json`.

## Notes
- Aggregate `$` views convert EUR/GBP at fixed rates set at the top of
  `build.py`. Undisclosed values are excluded from totals, not zeroed.
- GitHub cron is UTC and can be delayed under load; scheduled workflows
  auto-disable after 60 days of no repo activity, but the daily commit keeps it
  alive.
