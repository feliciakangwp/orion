# ORION — Budget Performance Management System

A prototype budget performance management system: Project Profiles, Source of
Funding, and the MTE / RB / OB / Block budgeting tabs, each driven by a
multi-step, role-based approval workflow.

## Stack

- `client/` — React + TypeScript (Vite) + Tailwind CSS single-page app. This
  is the deployed app: **it is fully static and self-contained**, with no
  backend at all. All the workflow/validation/permission logic that would
  normally live server-side (see `client/src/api.ts`, `client/src/lib/`, and
  `client/src/local/db.ts`) runs in the browser, and all data is persisted to
  the browser's own `localStorage` (see "Where does the data live" below).
- `server/` — an alternative Express + TypeScript API (JSON-file persisted)
  implementing the exact same behavior against a real backend. It's kept as
  a reference/starting point if this is ever turned into a real multi-user
  system with a shared database, but it is **not used by the deployed site**.

There is no real authentication. Instead, a **persona switcher** in the top
bar lets you act as any of the seeded personas — this is how the app
simulates different users/roles for demoing the workflow. All permission and
workflow rules (who can edit what, who can approve at each step, etc.) are
enforced in `client/src/api.ts` against whichever persona is currently
selected.

## Where does the data live

Because this deploys as a static site (GitHub Pages), there is nowhere to
run a shared backend. All projects, funding entries, budget lines, etc. are
stored in **that browser's `localStorage`**, under the key `orion.db.v1`.
Practically:

- Data is private to one browser on one device — it is **not shared**
  between different people or different devices. Switching personas via the
  top-bar dropdown is how you view the *same* local data from a different
  role's perspective (this is exactly how the app was already being
  demoed), not a way to collaborate with someone else's browser.
- Clearing site data / browsing in a private window / using a different
  browser all start you over with a fresh seed.
- The sidebar has a **"Reset Demo Data"** link that wipes and reseeds the
  local store on demand.

If you need real shared/multi-user data, point the client at the `server/`
API instead (swap `client/src/api.ts`'s local implementation back for a
fetch-based one — this is exactly what this repo's git history shows, since
that's how the app originally worked before this static rewrite) and deploy
`server/` somewhere that can run a Node process (Render, Fly.io, etc.).

## Running locally

```bash
cd client
npm install
npm run dev
```

Open the printed `localhost` URL. On first run the app seeds 24 personas
(see below) into `localStorage`.

To run the alternative real-backend version instead:

```bash
# Terminal 1 — API server (http://localhost:4000)
cd server
npm install
npm run dev

# Terminal 2 — client, pointed at the API instead of localStorage
# (requires restoring the fetch-based client/src/api.ts)
cd client
npm install
npm run dev
```

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` builds `client/` and publishes it to GitHub
Pages on every push to `main` or `claude/orion-budget-management-6qf8ii`.

**One-time manual step** (repo settings aren't reachable via this tool):
in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
After that, the workflow deploys automatically, and the site is served at:

```
https://<owner>.github.io/orion/
```

(`vite.config.ts`'s `base: '/orion/'` and the app's use of `HashRouter`
are both there to make routing work correctly under that GitHub Pages
subpath — GitHub Pages has no server-side rewrite for client-side routes,
so a path-based router would 404 on refresh of a deep link.)

## Personas

- Departments **PSB, PCB, SIB, ACB, FIN**, each with 4 personas: **Branch
  Rep, DY Head, Head, SMGT** (e.g. "PSB Branch Rep").
- Plus 4 department-independent Finance personas: **Fin Officer 1, Fin
  Officer 2, Fin Officer 3, Fin Manager**. These act centrally across every
  department's projects (distinct from "FIN Branch Rep" etc., which is the
  Finance department requesting its own budget like any other department).

## Feature map

- **Project Profile** list (menu: PROJECT PROFILE → Project Profile) with the
  required columns and a **NEW** button visible only to Branch Rep personas.
- **Details** tab — Status auto-populates Draft → Request to Create (Branch
  Rep submits) → Active (Finance approves). Sub Account / Dev Cost Centre /
  Operating Cost Centre / Finance Officer are greyed out until routed to
  Finance (Request to Create), at which point only Finance can fill them.
- **Source of Funding** tab — Branch Rep creates entries (status Pipeline);
  Fin Officer/Fin Manager approve (Pipeline → Approved), which requires a
  Funding Pot ID. Mainstreaming entries stay Pipeline forever and can only be
  swapped by the Branch Rep to a different, non-Mainstreaming source.
- **MTE** / **Block** tabs — identical structure, 15 vs. 5 FY columns
  starting from the project's Simulation Year (e.g. 2026 → FY26). Recurring
  lines auto-populate the remaining periods from the first period's amount
  (5% p.a. if it's an IT project, 3% p.a. otherwise); non-recurring lines are
  keyed independently.
- **RB** / **OB** tabs — same fields, Apr–Mar monthly columns instead of FY
  columns, Budget Type fixed to the tab.
- **Team Members** tab — add/remove personas as team members.
- Every budget line (MTE/RB/OB/Block) runs through the same two-round
  approval chain independently:
  1. New/Draft → **Pending Review** (Reviewer 1) → **Clarification** (Fin
     Officer, then Fin Manager) → **Ready for Approval** (back to Branch Rep).
  2. Branch Rep resubmits → **Pending Approval** through Reviewer 1 →
     Reviewer 2 → Approver → Fin Officer → Fin Manager → **Fin Supported**.

## Assumptions made where the spec was ambiguous

- **Approver** (the third sign-off in the second round, alongside Reviewer 1/
  2) is filled from the project's own department **SMGT** persona, mirroring
  how Reviewer 1/2 draw from DY Head/Head.
- Reviewer 1, Reviewer 2 and Approver dropdowns are scoped to the **same
  department** as the project's owning Branch Rep.
- A lightweight **Return** action lets any current approver send a line back
  to the Branch Rep's draft for rework — not explicitly specified, but
  necessary for the workflow to be usable (otherwise there's no way to
  correct a line once submitted).
- **Simulation Year** is a single field on the Project (editable by its
  Branch Rep) that drives both the MTE and Block FY column headers.
- "Pull Forward (Draft)" creates a budget line with origin `carried_forward`
  (status shows **Draft** instead of **New**) — the spec doesn't define how
  prior-year data actually gets copied in, so this is a stub for that origin
  flag rather than a real carry-forward-values implementation.
- Authentication is out of scope; the persona switcher stands in for login.
