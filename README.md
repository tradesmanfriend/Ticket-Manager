# Work Order Board

A maintenance ticket board for apartment complexes and rental agencies.
Sorts tickets by hazard/severity/age, tracks a status workflow (Reported →
Assessed → Quote received → Scheduled → Completed), organizes tickets by
department (HVAC, Plumbing, Electrical, Painting, and whatever else you add),
and keeps a per-unit history so past work is visible on the next ticket for
that unit.

This is a real client/server app, not a demo: a Node/Express API backed by
SQLite, and a React (Vite) frontend that talks to it over HTTP. Each
property (complex or agency) gets its own board with its own staff accounts
— one deployment can serve any number of them.

**Read "What this is not" near the bottom before you hand this to a
customer.** It covers the gaps a real commercial rollout would still need
closed.

> **Upgrading from an earlier version of this repo?** This release replaces
> the single shared property password with individual staff accounts, and
> renames tickets' `category` field to `department`. That's a breaking
> database schema change with no automatic migration. If you have a
> deployed database with real tickets in it, export it to CSV from Settings
> *before* upgrading — the old data won't carry over into the new tables.

## How it's organized

```
backend/   Express API + SQLite database (properties, staff, departments, tickets, notes)
frontend/  React app (Vite) — the UI staff actually use
.github/   Workflow that builds and deploys the frontend to GitHub Pages
```

## Accounts, permissions, and departments

Each property has its own **staff accounts** — a username and password per
person, not one shared login. The person who creates a property becomes its
first admin; admins add everyone else from **Settings → Manage team**.

Every staff member has a set of individually adjustable permissions, not
just a fixed role:

- **Departments** — either "all departments," or a specific list (e.g. just
  `Plumbing` and `HVAC`). This is what scopes which tickets someone can even
  see, not just what they can edit.
- **Can create tickets**
- **Can update status, vendor, and notes** — advancing the stepper, editing
  the vendor/scheduled-date fields, and adding log notes are bundled under
  this one permission, since they're all "doing the job" actions.
- **Can edit quote amounts** — kept separate from the above so you can let
  someone log work without exposing what jobs cost.
- **Can delete tickets**
- **Can manage the team, departments, and property name**

The "Role" dropdown (Admin / Manager / Staff / Viewer) is only a preset that
fills in sensible defaults for these — the actual enforcement everywhere in
the backend reads the individual permission flags, not the role label, so
you can build any combination you want (e.g. a "Staff" who can also delete
tickets). A property can never end up with zero people able to manage it —
the API blocks demoting or deactivating the last remaining admin.

**Departments** are configurable per property (Settings → Manage team, for
anyone with the "manage team" permission), seeded on creation with HVAC,
Plumbing, Electrical, Painting, Appliance, Structural, Pest Control, and
General. A ticket's department is set when it's created and isn't
reassignable afterward in this version. Deleting a department from the list
doesn't touch tickets already tagged with it, or staff already scoped to
it — it just stops appearing as an option for new tickets or new staff
assignments.

## Local development

**Backend**
```
cd backend
cp .env.example .env      # then edit .env — at minimum set JWT_SECRET
npm install
npm run dev
```
Runs on `http://localhost:4000`. `npm install` compiles `better-sqlite3`'s
native module, so this machine needs a C++ build toolchain (standard on
Mac/Linux; on Windows, install the "Desktop development with C++" workload
or use WSL).

**Frontend**
```
cd frontend
cp .env.example .env      # VITE_API_URL should point at the backend above
npm install
npm run dev
```
Runs on `http://localhost:5173` and talks to the backend you started above.

## Putting it on GitHub

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

GitHub itself only runs the *code* — it doesn't run a live Node server, so
the frontend and backend deploy differently:

### Frontend → GitHub Pages (free, on GitHub)

1. Repo **Settings → Pages → Build and deployment → Source**, choose
   **GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_API_URL` — your backend's public URL (see below; you'll have
     this after the backend step)
   - `VITE_BASE_PATH` — `/YOUR_REPO_NAME/` if this repo will serve at
     `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/` (the normal case).
     Leave it unset if you're using a custom domain or a `USERNAME.github.io`
     user-site repo.
3. Push to `main`. The included workflow
   (`.github/workflows/deploy-pages.yml`) builds `frontend/` and publishes
   it automatically. Check the **Actions** tab for progress and the live
   URL.

### Backend → a real Node host (not GitHub)

GitHub Pages and GitHub Actions can't run an always-on server, so the API
needs actual hosting. The backend is a plain Node app, so any of these
work: [Render](https://render.com), [Railway](https://railway.app),
[Fly.io](https://fly.io), or your own VPS with the included `Dockerfile`.
Render is the most beginner-friendly, so as an example:

1. New Web Service → connect this repo → set **root directory** to
   `backend` (a `render.yaml` is included if you'd rather use Render's
   Blueprint flow).
2. Build command `npm install`, start command `npm start`.
3. Environment variables: `JWT_SECRET` (long random string — Render can
   generate one), `FRONTEND_ORIGIN` (your GitHub Pages URL from above),
   `DB_PATH` (see the persistence note below).
4. Deploy, then copy the service's `https://...onrender.com` URL into the
   `VITE_API_URL` variable in your GitHub repo and re-run the Pages
   workflow.

**Persistence matters here.** SQLite writes to a file on disk. Render's
*free* plan has no persistent disk — your data is wiped on every redeploy
or restart. `render.yaml` in this repo requests a small persistent disk,
which requires a paid plan (their `starter` tier is the cheapest that
supports one, roughly $7/month as of this writing — check current pricing).
Railway and Fly both offer volumes too; check current terms before you
commit, since hosting pricing changes often. If you'd rather stay
serverless/free-tier everywhere, the tradeoff is real data loss on
restarts — fine for a demo, not for a property's actual maintenance
records.

## Data model

- **properties** — one row per complex/agency: `slug` (public code), `name`.
- **departments** — a property's configurable list of department names.
- **staff** — one row per login: username, password hash, display name,
  role label, and the individual permission columns described above.
- **tickets** — belongs to a property and a department: unit, title,
  description, severity, hazard flag, stage (0–4), vendor, quote amount,
  scheduled date, timestamps.
- **notes** — belongs to a ticket: a timestamped, attributed log entry.
  Status changes and manual notes both land here, which is what makes the
  "unit history" and audit trail work. The `by` on every note and the
  `created_by` on every ticket are set server-side from the authenticated
  staff member — never from anything the client sends — so the log can't be
  spoofed by editing request data.

Priority sort weights hazard tickets highest, then severity, then how many
days a ticket has been open — so an aging low-priority ticket still climbs
the list over time instead of sitting forgotten. The exact formula is
`priorityScore()` in `frontend/src/App.jsx`, easy to retune if your team
wants different weighting.

## What this is not

Being honest about scope before you put this in front of a customer:

- **No password recovery.** If someone forgets their password, there's no
  self-service reset — but any account with "manage team" permission can
  reset a teammate's password from Settings. If *every* admin is locked
  out, you'd need to update the database directly. Worth adding an
  email-based reset before real customers depend on this at scale.
- **No email at all**, in fact — accounts are created directly by an admin
  typing in a username and temporary password, then telling the person
  what it is. No invite emails, no verification.
- **No rate limiting or brute-force protection** on the login endpoint.
  Add something like `express-rate-limit` before this is public-facing at
  scale.
- **No automated backups.** The CSV export in Settings is a manual safety
  net; there's no scheduled backup of the SQLite file. For real customer
  data, add one (most hosts have a snapshot/backup add-on).
- **No monitoring, logging, or uptime alerting.** You'll want to know if
  the API goes down before your customers tell you.
- **No automated tests.** Everything here was written carefully but not
  machine-verified end-to-end — run through the core flows yourself
  (create property → add a staff member with limited departments → log in
  as them → confirm they only see their department's tickets → export CSV)
  before relying on it.
- **No terms of service, privacy policy, or data-handling agreement.** If
  you're actually selling this to other businesses, you'll want a lawyer's
  eyes on what you tell them about their data.

None of that makes it unusable — it makes it an honest, working starting
point rather than a finished commercial product. The gap between the two is
normal engineering work, not a sign anything here is broken.
