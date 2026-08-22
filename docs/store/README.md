# Store listing images

Upload these on the Chrome Web Store **Store listing** tab. Sizes are already correct.

- `promo-small.png` — **440×280** small promotional tile (required).
- `screenshots/` — **1280×800** PNGs (upload all five, or replace with live captures after smoke test):
  - `01-start.png` — Start: detect orgs, From / To, On this device vs Git
  - `02-type.png` — Package: type / What’s new
  - `03-members.png` — Package: members
  - `04-retrieve.png` — Retrieve: Jira + comment
  - `05-versions-diff.png` — Retrieve: this package vs saved snapshot
- Store icon: `../../extension/icons/icon128.png` (**128×128**)

These files were generated before Package became a single screen. After you smoke-test 1.11.18, recapture Start, Package (What’s new), Retrieve (side-by-side), and Confirm if the listing should match the live UI. Keep **1280×800** (screenshots) and **440×280** (promo), square corners, no padding.

Full paste kit: `../chrome-web-store.md`.
