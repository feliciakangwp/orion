# ORION — Budget Performance Management System

A prototype budget performance management system: Project Profiles, a
Finance-Admin-managed Source of Funding catalog, IT-Admin user/group
management, and the MTE / RB / OB / Block budgeting tabs, each driven by a
multi-step approval workflow.

## Stack

- `client/` — React + TypeScript (Vite) + Tailwind CSS single-page app. This
  is the deployed app: **it is fully static and self-contained**, with no
  backend at all. All the workflow/validation/permission logic that would
  normally live server-side (see `client/src/api.ts`, `client/src/lib/`, and
  `client/src/local/db.ts`) runs in the browser, and all data is persisted to
  the browser's own `localStorage` (see "Where does the data live" below).
- `server/` — an alternative Express + TypeScript API (JSON-file persisted),
  kept as a reference/starting point if this is ever turned into a real
  multi-user system with a shared database. **It reflects an older version
  of the data model** (fixed department-scoped Personas rather than the
  Users/Groups model described below) and was not updated alongside the
  client's User/Group rewrite — treat it as a historical reference, not a
  drop-in backend for the current client.

There is no real authentication. Instead, an **Impersonate** dropdown in the
top bar lets you act as any User set up in IT Admin → User Management — this
is how the app simulates different people/roles for demoing the workflow.
All permission and workflow rules (who can edit what, who can approve at
each step, who can see what) are enforced in `client/src/api.ts` against
whichever User is currently impersonated.

## Users & Groups

There's no concept of a fixed "persona" or department anymore. Instead:

- A **User** is just a name (e.g. a real person's name) with a **Status**
  (Active/Inactive) and one or more **Groups**.
- The available groups are: **Super Admin, Branch Rep, DY Head, Head, SMGT,
  CIO, HR, Finance Officer, Finance Manager, Finance Admin**.
- A user can belong to several groups at once, and gets the access of all of
  them. There is **no department scoping** anywhere — a user with "DY Head"
  can review any project, a Finance Officer/Finance Manager dropdown shows
  every user in either group, etc. (This was an explicit decision when
  rebuilding this on top of the earlier department-scoped persona model.)
- IT Admin → User Management (Super-Admin-only) is where Users are created
  and their groups/status edited.
- The app seeds one starter User per group (named after the group, e.g.
  "Branch Rep", "Finance Admin") so it's usable out of the box; add more
  realistically-named users from User Management as needed.

## Where does the data live

Because this deploys as a static site (GitHub Pages), there is nowhere to
run a shared backend. All users, projects, funding entries, budget lines,
etc. are stored in **that browser's `localStorage`**, under the key
`orion.db.v2`. Practically:

- Data is private to one browser on one device — it is **not shared**
  between different people or different devices. Impersonating different
  Users via the top-bar dropdown is how you view the *same* local data from
  a different person's perspective, not a way to collaborate with someone
  else's browser.
- Clearing site data / browsing in a private window / using a different
  browser all start you over with a fresh seed.
- The sidebar has a **"Reset Demo Data"** link that wipes and reseeds the
  local store on demand — this is also how to get a clean Project Profile
  slate if you've been testing.

If you need real shared/multi-user data, you'd need a real backend; `server/`
is a starting point but needs its own User/Group rewrite first (see above).

## Running locally

```bash
cd client
npm install
npm run dev
```

Open the printed `localhost` URL. On first run the app seeds 10 Users (one
per group) and the 8-row Source of Funding catalog into `localStorage`.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` builds `client/` and publishes it to GitHub
Pages on every push to `main` or `claude/orion-budget-management-6qf8ii`,
served at:

```
https://<owner>.github.io/orion/
```

(`vite.config.ts`'s `base: '/orion/'` and the app's use of `HashRouter`
are both there to make routing work correctly under that GitHub Pages
subpath — GitHub Pages has no server-side rewrite for client-side routes,
so a path-based router would 404 on refresh of a deep link.)

## Feature map

- **Project Profile** list (sidebar: PROJECT PROFILE → Project Profile) with
  the required columns and a **NEW** button visible only to users with the
  Branch Rep group.
- **Details** tab — Status auto-populates Draft → Request to Create (Branch
  Rep submits) → **Active** (Finance approves) or **Rejected** (Finance
  rejects). From Rejected, the Branch Rep can revise the title/justification
  and resubmit, which goes back to Request to Create. Sub Account / Dev
  Cost Centre / Operating Cost Centre / Finance Officer are greyed out until
  routed to Finance, at which point only Finance (Officer or Manager) can
  fill them; the Finance Officer dropdown lists every user in either the
  Finance Officer or Finance Manager group.
- **Finance Admin → Source of Funding** (sidebar section visible only to the
  Finance Admin group) is a master catalog of named funding sources, each
  with a **Type** (Pipeline or Approved — typically as a named pair, e.g.
  "Within the Block (P)" / "Within the Block"), an **Internal/External**
  category, and a **Status** (Active/Inactive, toggleable). Finance Admin
  adds new entries here with **+ Add**.
- **Source of Funding** tab (inside a project) — Branch Rep picks a catalog
  entry; the dropdown only offers **Active, Pipeline** entries. Finance
  (Officer/Manager) or Finance Admin later swap it to the matching
  **Approved** catalog entry as the approval action itself — there's no
  separate "approve" button or Funding Pot ID field.
- **MTE** / **Block** tabs — identical structure, 15 vs. 5 FY columns
  starting from the global **Simulation Year** control in the top bar. It
  applies across every project, so switching it is a "what-if" lens rather
  than a per-project setting. Recurring lines auto-populate the remaining
  periods from the first period's amount (5% p.a. if it's an IT project, 3%
  p.a. otherwise); non-recurring lines are keyed independently.
- **RB** / **OB** tabs — same fields, Apr–Mar monthly columns instead of FY
  columns, Budget Type fixed to the tab.
- **Team Members** tab — **+ Add** opens a search-and-multi-select modal
  over every User; the list then shows each member's name and group(s).
- Every budget line (MTE/RB/OB/Block) runs through the same two-round
  approval chain independently:
  1. New/Draft → **Pending Review** (Reviewer 1) → **Clarification** (Fin
     Officer, then Fin Manager) → **Ready for Approval** (back to Branch Rep).
  2. Branch Rep resubmits → **Pending Approval** through Reviewer 1 →
     Reviewer 2 → Approver → Fin Officer → Fin Manager → **Fin Supported**.
  Reviewer 1/2 dropdowns list every user in the DY Head or Head group;
  Approver lists every SMGT user; Finance Officer lists every Finance
  Officer/Finance Manager user — none of this is department-scoped.
- **Line-level visibility**: a user only sees a budget line if they're
  tagged on it somewhere (assigned to, Reviewer 1, Reviewer 2, Approver, or
  Finance Officer) or they're a team member of the project — see
  `canSeeLine` in `client/src/lib/workflow.ts`. Finance (Officer, Manager,
  **or Admin**) is the exception and always sees every line.
- **Simulation Date** (top bar, next to Simulation Year) is a global
  "pretend today is this date" setting with a native calendar picker and a
  **Today** button to snap back to the real current date.

## Assumptions made where the spec was ambiguous

- Removing department scoping entirely (rather than keeping it as a field
  alongside Groups) was an explicit choice, confirmed before doing this
  rewrite, and follows directly from the Finance Officer dropdown being
  specified as "all Finance Officer and Finance Manager" with no department
  qualifier.
- IT Admin → User Management is restricted to the **Super Admin** group;
  Finance Admin → Source of Funding's **+ Add** is restricted to the
  **Finance Admin** group (both confirmed before this rewrite).
- A funding catalog entry's **Type** (Pipeline/Approved) and **category**
  (Internal/External) are independent, admin-set fields — the app doesn't
  try to infer or enforce that e.g. "Within the Block (P)" and "Within the
  Block" are a matched pair beyond their names; Finance just picks any
  Active, Approved-type entry when promoting a project's funding source.
- A **Reject** action (Request to Create → Rejected) and a revise-and-
  resubmit path (Rejected → edit → Request to Create) were added since the
  spec described "Approve or Reject" explicitly but the app only had Approve
  before; leaving Rejected as a dead end seemed like an obvious gap.
- Approver (the third sign-off in round two of the budget-line workflow) is
  filled from the **SMGT** group, mirroring how Reviewer 1/2 draw from DY
  Head/Head — carried over from the original design, still undocumented in
  the group-list spec itself.
- A lightweight **Return** action lets any current approver on a budget line
  send it back to the Branch Rep's draft for rework — not explicitly
  specified, but necessary for the workflow to be usable.
- "Pull Forward (Draft)" creates a budget line with origin `carried_forward`
  (status shows **Draft** instead of **New**) — the spec doesn't define how
  prior-year data actually gets copied in, so this is a stub for that origin
  flag rather than a real carry-forward-values implementation.
- Authentication is out of scope; the Impersonate dropdown stands in for
  login, and anyone can impersonate anyone (there's no login/password of any
  kind gating who can pick which User).
- Line-level visibility (and every other permission check) is enforced in
  `client/src/api.ts`, not by a real trust boundary — since the whole app
  runs client-side against `localStorage`, anyone with devtools can read the
  raw data regardless of which user the UI is currently showing. This
  matches the rest of the app's access control, which was never intended as
  real security, only as an accurate simulation of the business rules.
