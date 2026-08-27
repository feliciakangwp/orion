# ORION — Budget Performance Management System

A prototype budget performance management system: Project Profiles, Source of
Funding, and the MTE / RB / OB / Block budgeting tabs, each driven by a
multi-step, role-based approval workflow.

## Stack

- `server/` — Express + TypeScript API, persisted to a JSON file (`server/data/db.json`).
  No real database is needed for this scope; the workflow/validation logic all
  lives in `server/src/lib` and `server/src/routes`.
- `client/` — React + TypeScript (Vite) + Tailwind CSS single-page app.

There is no real authentication. Instead, a **persona switcher** in the top
bar lets you act as any of the seeded personas — this is how the app
simulates different users/roles for demoing the workflow. The client sends
the chosen persona id as an `x-persona-id` header, and the server enforces
all permission/workflow rules against it (the client-side gating is only for
UX; the server is the source of truth).

## Running locally

```bash
# Terminal 1 — API server (http://localhost:4000)
cd server
npm install
npm run dev

# Terminal 2 — client (http://localhost:5173, proxies /api to :4000)
cd client
npm install
npm run dev
```

On first run the server seeds 24 personas (see below) into
`server/data/db.json`. `POST /api/dev/reseed` wipes and reseeds the store if
you want a clean slate while testing.

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
