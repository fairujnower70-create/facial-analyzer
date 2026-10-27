# Mien — Precision Facial Expression & Emotion Analysis

A full-stack facial analysis web app with a deep-slate / electric-violet /
neon-indigo SaaS look.

- **Frontend**: static HTML/CSS/JS (no build step). Face detection, landmarks,
  age/gender, and expression analysis run **in the browser** via
  [face-api.js](https://github.com/vladmandic/face-api) (loaded from a CDN).
  Face shape and symmetry are computed from the 68 landmark points with
  simple geometric heuristics.
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`). Handles
  signup/login (JWT in an httpOnly cookie, passwords hashed with bcrypt) and
  stores each user's saved scan history.

## Pages

| Page | Path |
| --- | --- |
| Landing | `/index.html` |
| Sign up | `/signup.html` |
| Log in | `/login.html` |
| Dashboard (overview) | `/dashboard.html` — requires login |
| Scan | `/scan.html` — requires login |
| History | `/history.html` — requires login |
| Admin panel | `/admin.html` — requires an admin-role account |
| About | `/about.html` |

## Run it locally

```bash
cd backend
cp .env.example .env      # then edit JWT_SECRET to a long random string
npm install
npm start
```

The server serves both the API (`/api/...`) and the frontend, so once it's
running, open:

```
http://localhost:4000
```

## How analysis and storage work

1. You upload a photo or capture a webcam frame.
2. `face-api.js` model weights are fetched from a CDN the first time you run
   a scan, then everything runs locally in your browser — the raw image is
   never sent to the backend.
3. If you click **Save to history**, the *computed results* (age, gender,
   expression scores, face shape, symmetry score, and an optional small
   thumbnail) are POSTed to `/api/scans` and stored in SQLite, tied to your
   account via the JWT cookie.

## Accuracy notes

- **Detection**: uses `SsdMobilenetv1` (trained on the WIDER FACE dataset)
  instead of the fast/tiny detector — slower, but the more precise face box
  and landmark alignment matters because every downstream ratio is computed
  from those landmark positions.
- **Age / gender**: model trained on IMDB-WIKI (~500k labeled faces).
- **Expression**: model trained on FER2013.
- **Landmarks**: model trained on iBUG 300-W / 300VW.
- **Face shape**: `frontend/js/reference-data.js` holds a small labeled
  reference set — one centroid per shape archetype, defined by the same four
  ratios computed for a live scan. Classification is nearest-centroid
  (`frontend/js/analyze.js -> classifyFaceShape`) with a reported match
  confidence, instead of the brittle fixed-threshold if/else logic from the
  first version. **This reference set is expert-defined from published
  craniofacial-proportion ranges, not learned from a labeled photo dataset**
  — there's no training pipeline or labeled image corpus in this
  environment. If you have (or can license) a landmark-annotated face-shape
  dataset, the accurate upgrade path is: run `computeRatioVector()` over it,
  average the ratios per class, and replace the centroids in
  `reference-data.js` — the classifier code doesn't need to change.
- **Symmetry**: calibrated against a population-typical asymmetry baseline
  (`SYMMETRY_BASELINE_DEVIATION` in `reference-data.js`) instead of scoring
  against zero deviation, since no real face is perfectly symmetric.

## Admin panel

The **first account created** on a fresh database is automatically made an
admin. Log in with that account and an "Admin" link appears in the nav
(also reachable directly at `/admin.html`). It shows:

- account-wide stats (users, scans, scans today, new users this week)
- an **emotion breakdown** across every logged scan
- a **recent activity** feed
- a **users table** (with delete)
- a **scan log table** with a live search box (filters by name, email,
  gender, expression, or face shape) and **Export CSV** / **Export JSON**
  buttons for the currently-loaded scan logs

Admin routes are protected server-side by a `role` check, not just hidden
in the UI.

To promote a different existing user to admin later, stop the server and
run:

```bash
cd backend
node -e "require('better-sqlite3')('data.sqlite').prepare(\"UPDATE users SET role='admin' WHERE email=?\").run('someone@example.com')"
```

## Troubleshooting: "my scans aren't saving"

This is almost always one of two things:

1. **A leftover `backend/data.sqlite` from an older version of this app.**
   The database only adds new columns to a *brand-new* file — an existing
   file from before doesn't get them automatically, so a save can fail
   with a column-not-found error. Fixed in this version with an automatic
   migration on startup, but if you're still stuck, the reliable fix is to
   stop the server and delete `backend/data.sqlite` (and the `-wal`/`-shm`
   files next to it), then restart — this resets all accounts and scans.
2. **The frontend and backend aren't on the same origin.** If you're
   opening the HTML files directly, or serving `frontend/` with a separate
   tool (like a VS Code "Live Server" extension) instead of through the
   Express server, the login cookie and `/api/...` calls won't line up.
   Always open the app at the URL the backend prints
   (`http://localhost:4000` by default) — not a different port.

If a save still fails, the dashboard now shows the actual error message
next to the "Save to history" button instead of failing silently.

## Using this on more than one computer

By default, your accounts and scan history live in **`backend/data.sqlite`**
— a file tied to that specific folder on that specific computer. Node
auto-creates a brand-new, empty one if it doesn't find that exact file, so
copying just the code (e.g. re-downloading a zip, or `git clone`) to another
PC gives you a fresh, empty database — **not** an error, just a new file.
This is the #1 cause of "I can't log in / where's my admin account" after
moving computers.

**One-time move to a new PC:** copy these three files from the old
computer's `backend/` folder to the new one's `backend/` folder — as loose
files, unrenamed, replacing whatever is already there (stop the server on
both ends first):
```
data.sqlite
data.sqlite-shm
data.sqlite-wal
```
(the `-shm`/`-wal` files may not exist if the app was never run — that's
fine, just copy whichever of the three are present). The account that was
first ever created in that file keeps its `admin` role automatically —
nothing to reconfigure.

**Using the same account/history on multiple computers without manually
copying every time:** set `DB_PATH` in `backend/.env` to an absolute path
inside a folder that syncs between your computers (OneDrive, Google Drive,
a USB drive you move between them, etc.) — see the example in
`.env.example`. Every computer with the *same* `DB_PATH` reads and writes
the exact same file, so signup/login/history/admin all stay identical no
matter which PC you're on. Two things matter for this to stay safe:
- Only run the server (`npm start`) on **one computer at a time**. SQLite
  isn't built for two processes writing to the same file at once.
- If it's a cloud-synced folder, make sure syncing has finished before
  switching to the other computer — closing the app doesn't guarantee the
  sync client has uploaded/downloaded the latest version yet.

This keeps everything local (no online database, nothing sent to a
server you don't control) while solving the "different data on every PC"
problem.

## Notes & limitations
- This is a demo build: age/gender/expression are model estimates, and face
  shape/symmetry are simple heuristics — not clinical or forensic tools.
- SQLite data lives in `backend/data.sqlite` (or wherever `DB_PATH` points);
  delete that file to reset all users and scans.
- For production use you'd want: email verification, rate limiting on auth
  routes, HTTPS, a stronger session strategy, and hosting the face-api.js
  model weights yourself instead of a public CDN.
