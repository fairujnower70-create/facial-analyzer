# Mien — Precision Facial Expression & Emotion Analysis

A full-stack facial analysis web app with a deep-slate / electric-violet /
neon-indigo SaaS look.

- **Frontend**: static HTML/CSS/JS (no build step). Face detection, landmarks,
  age/gender, and expression analysis run **in the browser** via
  [face-api.js](https://github.com/vladmandic/face-api) (loaded from a CDN).
  Face shape and symmetry are computed from the 68 landmark points with
  simple geometric heuristics.
- **Backend**: Node.js + Express + **PostgreSQL** (`pg`). Handles
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

## Environment variables

Set these in `backend/.env` (local) or in your host's Environment settings.

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (e.g. from Neon). |
| `JWT_SECRET` | yes | A long random string used to sign login cookies. |
| `NODE_ENV` | on a live site | Set to `production` online (makes cookies HTTPS-only). |
| `ADMIN_EMAIL` | recommended | Only this email becomes admin. If empty, the first account ever created becomes admin. |
| `PORT` | no | Hosts like Render set this automatically. Defaults to 4000. |

## Run it locally

You need a PostgreSQL database. The easiest is a free [Neon](https://neon.tech)
project: copy its connection string into `DATABASE_URL`.

```bash
cd backend
cp .env.example .env      # then fill in DATABASE_URL and JWT_SECRET
npm install
npm start
```

The tables are created automatically on first start. The server serves both
the API (`/api/...`) and the frontend, so once it's running, open:

```
http://localhost:4000
```

## Deploy online (Render + Neon, both have free plans)

1. **Neon**: create a project, then copy the connection string (it ends with
   `?sslmode=require`). If it also contains `&channel_binding=require`, remove
   that part.
2. **Render**: New → Web Service → connect this GitHub repo.
   - Root Directory: leave empty (the server also serves `../frontend`)
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment Variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`,
     and `ADMIN_EMAIL` (your own email).
3. Open the Render URL and **sign up with the `ADMIN_EMAIL` address first** —
   that account becomes the admin.

Because the data lives in Neon (not on the web server's disk), accounts and
scan history survive restarts and redeploys. On Render's free plan the app
goes to sleep after ~15 minutes without visitors, so the first visit after a
break takes about a minute to wake up.

## Extra features

- **Forgot password**: there is no email service, so a request from `/forgot.html`
  appears in the **Admin panel → Password reset requests**. The admin generates a
  temporary password (shown once) and gives it to the user, who can change it on
  `/account.html`. The admin can also reset any user from the Users table.
- **Mood journal** (`/journal.html`): daily streak and a calendar coloured by emotion.
- **Compare scans** and **Share** (image card) in History; **Scan all faces** for group photos.
- **Light / dark theme** toggle in the navbar.

## How analysis and storage work

1. You upload a photo or capture a webcam frame.
2. `face-api.js` model weights are fetched from a CDN the first time you run
   a scan, then everything runs locally in your browser — the raw image is
   never sent to the backend.
3. If you click **Save to history**, the *computed results* (age, gender,
   expression scores, face shape, symmetry score, and a small 320px JPEG
   thumbnail) are POSTed to `/api/scans` and stored in PostgreSQL, tied to
   your account via the JWT cookie.

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

Who is admin: if `ADMIN_EMAIL` is set, only the account with that email is
an admin. If it is not set, the **first account created** on an empty
database is automatically made an admin. Log in with that account and an
"Admin" link appears in the nav (also reachable directly at `/admin.html`).
It shows:

- account-wide stats (users, scans, scans today, new users this week)
- an **emotion breakdown** across every logged scan
- a **recent activity** feed
- a **users table** (with delete)
- a **scan log table** with a live search box (filters by name, email,
  gender, expression, or face shape) and **Export CSV** / **Export JSON**
  buttons for the currently-loaded scan logs

Admin routes are protected server-side by a `role` check, not just hidden
in the UI.

To make a different existing user an admin, either set `ADMIN_EMAIL` to their
email and restart, or run this in the Neon **SQL Editor**:

```sql
UPDATE users SET role = 'admin' WHERE email = 'someone@example.com';
```

(They need to log out and log in again for the new role to apply.)

## Troubleshooting

- **Deploy fails with "DATABASE_URL is not set"**: add it in Render →
  Environment, then redeploy.
- **"Could not connect to the database"** in the logs: re-copy the Neon
  connection string; make sure it ends with `?sslmode=require` and has no
  extra spaces.
- **"my scans aren't saving"**: open the site through the URL the server
  prints (not by double-clicking the HTML files or using a separate "Live
  Server"), otherwise the login cookie and `/api/...` calls won't line up. The
  Scan page shows the real error message next to "Save to history".
- **I forgot who is admin**: run
  `SELECT email, role FROM users;` in the Neon SQL Editor.

## Notes & limitations
- This is a demo build: age/gender/expression are model estimates, and face
  shape/symmetry are simple heuristics — not clinical or forensic tools.
- All data lives in your PostgreSQL database; to reset everything, run
  `DROP TABLE scans; DROP TABLE users;` and restart the server.
- For production use you'd want: email verification, rate limiting on auth
  routes, a stronger session strategy, and hosting the face-api.js model
  weights yourself instead of a public CDN.
