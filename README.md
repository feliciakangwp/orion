# ORION — Budget Performance Management System

A prototype budget performance management system: Project Profiles, a
Finance-Admin-managed Source of Funding / Account / Cost Centre catalogs,
IT-Admin user/group management, a cross-project Medium Term Projection view,
and the MTP / Revised Budget / Original Budget / Block Budget budgeting
tabs, each driven by a multi-step approval workflow.

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

- A **User** is a name, an **email address**, a **Status** (Active/Inactive)
  and one or more **Groups**.
- The available groups are: **Super Admin, Branch Rep, DY Head, Head, SMGT,
  CIO, HR, Finance Officer, Finance Manager, Finance Admin**.
- A user can belong to several groups at once, and gets the access of all of
  them. There is **no department scoping** anywhere — a user with "DY Head"
  can review any project, a Finance Officer/Finance Manager dropdown shows
  every user in either group, etc. (This was an explicit decision when
  rebuilding this on top of the earlier department-scoped persona model.)
- **Super Admin is an unconditional override**: a Super Admin user can do
  anything any other group can do, anywhere in the app — see every project
  and every budget line regardless of tagging or team membership, edit and
  submit a project they didn't create, approve/reject it as if Finance,
  act as any reviewer/approver/finance step on any budget line, and reach
  Finance Admin and IT Admin regardless of holding those specific groups.
  This is folded directly into the shared permission functions in
  `client/src/lib/workflow.ts` (`isOwningBranchRep`, `isFinance`,
  `userCanAct`, `canSeeLine`, etc.) rather than checked ad hoc, so nothing
  can end up accidentally gating Super Admin out. It does **not** add Super
  Admin to selection dropdowns (e.g. a budget line's Reviewer 1 list is
  still just DY Head/Head users) — it grants the ability to act in those
  roles, not membership in them.
- IT Admin → User Management (Super-Admin-only) is where Users are created
  and their groups/status edited.
- The app seeds one starter User per group (named after the group, e.g.
  "Branch Rep", "Finance Admin") so it's usable out of the box; add more
  realistically-named users from User Management as needed.

## Where does the data live

Because this deploys as a static site (GitHub Pages), there is nowhere to
run a shared backend. All users, projects, funding entries, budget lines,
etc. are stored in **that browser's `localStorage`**, under the key
`orion.db.v5`. Practically:

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
per group, each with a placeholder `@orion.gov` email), the 8-row Source of
Funding catalog, one Account (`511604` / ICT Consultation Services), one
Cost Centre (`998019` / Minor Development Project), the Inflation Rate table
(Non IT Item 3%, IT Item 5%), and the 3 Budget Period
exercises (all Draft) into `localStorage`.

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
- **Project Profile Request** (sidebar: PROJECT PROFILE → Project Profile
  Request) — a filtered queue of **Pending** Project Profiles: a Branch Rep
  sees their own requests awaiting Finance approval (and can still open and
  edit one while Pending); Finance (Officer/Manager, or Super Admin) sees
  every Pending request, i.e. everything awaiting their approval.
- **Details** tab — Status auto-populates Draft → **Pending** (Branch Rep
  submits) → **Active** (Finance approves) or **Rejected** (Finance
  rejects). From Rejected, the Branch Rep can revise the title/justification
  and resubmit, which goes back to Pending; while Pending, the Branch Rep
  can still revise the title/justification/comments (they just can't
  resubmit again — it's already in Finance's queue). Sub Account / Dev
  Cost Centre / Operating Cost Centre / Finance Officer are greyed out until
  routed to Finance, at which point only Finance (Officer or Manager) can
  fill them; the Finance Officer dropdown lists every user in either the
  Finance Officer or Finance Manager group.
- **Finance Admin → Source of Funding / Account / Cost Centre** (sidebar
  section visible only to the Finance Admin group) are master catalogs:
  - **Source of Funding** — named funding sources, each with a **Type**
    (Pipeline or Approved — typically as a named pair, e.g. "Within the
    Block (P)" / "Within the Block"), an **Internal/External** category,
    and a **Status** (Active/Inactive, toggleable).
  - **Account** — a code + description (seeded with `511604` / ICT
    Consultation Services).
  - **Cost Centre** — a code + description (seeded with `998019` / Minor
    Development Project).
  Finance Admin adds new entries to any of the three with **+ Add**. The
  Account and Cost Centre fields on every budget line (MTP/RB/OB/Block) are
  dropdowns populated from these two catalogs rather than free text.
- **Finance Admin → Budget Period** manages the three budgeting exercises —
  **Medium Term Projection** (kind MTP), **Annual Budget** (kinds RB + OB
  together, since Original and Revised are both part of the same annual
  cycle), and **Block Budget** (kind BLOCK) — each one a card with a
  **Start Date**, an **End Date**, and a status: **Draft** → **Open** →
  **Closed for Submission** (automatic, once End Date has passed) →
  **Closed and Locked** (Finance Admin's explicit "Closed and Lock").
  - Only one exercise can be active (non-Draft) at a time; Finance Admin
    must **Reset to Draft** a Closed and Locked exercise before a different
    one can be opened.
  - Start Date locks the moment an exercise is opened; End Date stays
    editable while Open, and locks too once it's passed (Closed for
    Submission) or the exercise is Closed and Locked.
  - **Opening Medium Term Projection** rolls every existing MTP line
    forward into the new 15-year window starting at the Start Date's
    Financial Year (e.g. opening with a Start Date in FY26 moves the
    window from FY25–39 to FY26–40): every overlapping FY keeps its
    existing value, the one new year at the end is auto-populated the same
    way a recurring line always has been (5% p.a. for IT projects, 3% p.a.
    otherwise; a non-recurring line's new year starts at 0), and every
    line's workflow step resets to Branch Rep Draft so it can be worked
    again for the new cycle. The global **Simulation Year** control follows
    along to the new window automatically.
  - While **Open**, Branch Rep/DY Head/Head/SMGT/Finance Officer/Finance
    Manager can all edit/submit/approve lines of that exercise's kind(s) as
    normal. Once **Closed for Submission**, only Finance Officer/Finance
    Manager still can. Once **Closed and Locked**, no one but Super Admin
    can — Finance Admin must **Reopen** it first (which resumes whichever
    of Open/Closed for Submission the End Date already implies, i.e. this
    undoes only the lock, not a submission deadline that had already
    passed).
- **Source of Funding** tab (inside a project) — Branch Rep clicks
  **+ Add Source of Fund**, which opens a modal with a single dropdown
  (defaulting to unselected) of **Active, Pipeline** catalog entries and an
  **Add** button to confirm. Finance (Officer/Manager) or Finance Admin
  later swap an entry to the matching **Approved** catalog entry as the
  approval action itself — there's no separate "approve" button or Funding
  Pot ID field.
- **MTP** / **Block Budget** tabs — identical structure, 15 vs. 5 FY columns
  starting from the global **Simulation Year** control in the top bar. It
  applies across every project, so switching it is a "what-if" lens rather
  than a per-project setting. Recurring lines auto-populate the remaining
  periods from the first period's amount (5% p.a. if it's an IT project, 3%
  p.a. otherwise); non-recurring lines are keyed independently.
- **Revised Budget** (RB) / **Original Budget** (OB) tabs — same fields,
  Apr–Mar monthly columns instead of FY columns, Budget Type fixed to the
  tab.
- **Medium Term Projection → Budget Line Item** (sidebar header, visible to
  everyone — no group gate) is a cross-project view of every **MTP**-kind
  budget line the acting user can see, across every Project Profile, plus
  any **ad hoc** line that isn't tied to a Project Profile at all (its
  Project Title shows blank). **+ Add** (Branch Rep/Super Admin only) creates
  a new ad hoc line; each row's **Project Title** is itself a dropdown of
  the projects the acting user is a team member of (or owns as Branch Rep)
  — picking one attaches the line to that project, and it's the same
  underlying record, so it immediately also appears on that project's own
  MTP tab (and vice versa: detaching it there, by clearing Project Title,
  turns it back into an ad hoc line here).
- **Team Members** tab — **+ Add** opens a search-and-multi-select modal
  over every User; the list then shows each member's name and group(s).
- Every budget line (MTP/RB/OB/Block) runs through the same single linear
  approval chain:
  **Draft** (Branch Rep submits) → **Review** (Reviewer 1) →
  **Clarification** (Finance Officer, then Finance Manager — either can
  reject back one step, which the other side then "clarifies" and
  resubmits) → **Pending Approval** (Reviewer 2, then **CIO** if it's an
  IT project or the **Approver** otherwise) → **Approved**. A reject at
  Review or Pending Approval restarts the whole line at Branch Rep Draft;
  a reject during Clarification only bounces back one step. Reviewer 1/2
  dropdowns list every user in the DY Head or Head group (Reviewer 2 must
  be a different person from Reviewer 1); Approver lists every SMGT user;
  Finance Officer/Finance Manager/CIO act by group membership, not a
  per-line pick — none of this is department-scoped.
- The moment a line reaches **Approved**, it's duplicated into **Fin
  Supported** (see below) with its figures rounded to the nearest 100
  (a figure under 100 is left exactly as it is); the original line stays
  exactly as approved and is never edited again.
- **Line-level visibility**: a user only sees a budget line if they're
  tagged on it somewhere (assigned to, Reviewer 1, Reviewer 2, Approver, or
  Finance Officer) or they're a team member of the project — see
  `canSeeLine` in `client/src/lib/workflow.ts`. Finance (Officer, Manager,
  **or Admin**) is the exception and always sees every line. The MTP-only
  action-queue tabs below (Review Phase, Approval Phase) use a different
  rule instead — see "MTP action-queue tabs" below — since a CIO-group
  user needs to see a line the moment it reaches them even without being
  tagged or a team member.
- **Finance Admin → Inflation Rate** (sidebar section visible only to the
  Finance Admin group): a 2-row table, **Non IT Item** (seeded 3%) and
  **IT Item** (seeded 5%) — Finance Admin can change the values only. These
  rates drive both the auto-growth of recurring MTP/Block lines and the
  MTP Variance justification threshold below.
- **Medium Term Projection → MTP Variance**: every MTP line whose current
  figures have diverged from what they were right after the last MTP
  rollover (or, for a brand-new line, from an all-zero baseline) by more
  than the Inflation Rate for at least one Financial Year. Columns include
  Status, Justification, Description, Account, Sub Account, Ops/Dev,
  Source of Funding, Cost Centre, Project Title, then per FY: `FYxx
  (Previous)`, `FYxx`, `FYxx Variance Amount`, `FYxx Variance %`, `FYxx
  Justification`. Only the **earliest** flagged year needs an actual
  justification (editable by the owning Branch Rep); a later flagged year
  needs none. A line can't be submitted while its required justification
  is still empty.
- **Medium Term Projection action-queue tabs** — Review Phase and Approval
  Phase are visible to everyone, but only ever show a line the moment it's
  actually that viewer's turn to act on it (Review/Clarification statuses
  in Review Phase; Pending Approval in Approval Phase). **Clarification
  (FO)** and **Clarification (FM)** (Finance Manager only) give her
  visibility into the whole clarification pipeline — (FO) shows lines
  still with Finance Officer (read-only), (FM) shows lines now routed to
  her (actionable, same as Review Phase). **Fin Supported** lists every
  Approved line's rounded duplicate; Finance Officer/Finance Manager can
  edit its figures (never the original line). **MTP with Inactive Users**
  is a cleanup view of MTP lines tagged to a user who is now Inactive.
- **Simulation Date** (top bar, next to Simulation Year) is a global
  "pretend today is this date" setting with a native calendar picker and a
  **Today** button to snap back to the real current date. Budget Period's
  Closed for Submission transition is evaluated against this date, not the
  browser's real clock, so you can test deadline behavior without waiting.
- **Simulation Date** (top bar, next to Simulation Year) is a global
  "pretend today is this date" setting with a native calendar picker and a
  **Today** button to snap back to the real current date. Budget Period's
  Closed for Submission transition is evaluated against this date, not the
  browser's real clock, so you can test deadline behavior without waiting.

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
- A **Reject** action (Pending → Rejected) and a revise-and-resubmit path
  (Rejected → edit → Pending) were added since the spec described "Approve
  or Reject" explicitly but the app only had Approve before; leaving
  Rejected as a dead end seemed like an obvious gap.
- Approver (the third sign-off in round two of the budget-line workflow) is
  filled from the **SMGT** group, mirroring how Reviewer 1/2 draw from DY
  Head/Head — carried over from the original design, still undocumented in
  the group-list spec itself.
- A lightweight **Return** action lets any current approver on a budget line
  send it back to the Branch Rep's draft for rework — not explicitly
  specified, but necessary for the workflow to be usable.
- Adding a Budget Line Item from Medium Term Projection (an ad hoc line, or
  one attached to a project) is restricted to Branch Rep/Super Admin, same
  as creating a project — mirroring how every other budget-line creation
  path in the app already requires that group. Attaching an *existing* ad
  hoc line to a project, though, only requires being a team member of (or
  the owning Branch Rep on) that project, per the spec's "shows a drop down
  of the Projects that they are a team member of" wording; the line's
  actual Branch-Rep-owned workflow afterwards follows that project's real
  Branch Rep, not whoever attached it.
- "Annual Budget" is modeled as **one** Budget Period exercise covering
  **both** the Revised Budget (RB) and Original Budget (OB) kinds together
  (confirmed before building this), rather than 4 separate exercises for
  the app's 4 budget-line kinds.
- "Only one budget exercise open at a time" is enforced as "only one
  non-Draft at all" (confirmed before building this) — Medium Term
  Projection being Closed and Locked still blocks Annual Budget or Block
  Budget from opening, not just from simultaneously being Open. Since the
  spec gave no explicit way to retire a finished cycle and free that slot,
  a Finance-Admin-only **Reset to Draft** action (available once a period
  is Closed and Locked) was added for this purpose — without it, once any
  exercise were ever opened, no other exercise could ever be opened again.
- Reopening a Closed and Locked period returns it to **Open** internally,
  which is then immediately redisplayed as **Closed for Submission** if its
  End Date has already passed (confirmed before building this) — i.e.
  Reopen undoes only the Finance Admin lock, never a submission deadline
  that had already passed on its own.
- Medium Term Projection's pull-forward-on-open behavior (carry over
  overlapping FY values, auto-populate the one new year) is specific to
  that exercise, per the spec's example — Annual Budget and Block Budget
  opening only changes their status/dates; their existing lines are left as
  they are, with no prior-year carry-forward.
- The new Draft/Review/Clarification/Pending Approval/Approved workflow
  (confirmed before building this) replaces the old two-round chain for
  **every** budget kind (MTP, RB, OB, Block), not just MTP, even though the
  spec described it in an MTP-specific context.
  CIO acts by **group membership** (like Finance Officer/Finance
  Manager/Finance Admin), not as a per-line picked person like Reviewer
  1/2/Approver — there's no "CIO" dropdown, any CIO-group user can act.
  Reviewer 2 is required to be a different person from Reviewer 1
  (confirmed before building this). CIO's "support" at Pending Approval
  for an IT project is treated as equivalent to the Approver's "approve"
  for a non-IT one — both are terminal, both trigger the Fin Supported
  duplicate — since the spec described them as alternative branches, not
  a sequential CIO-then-Approver chain.
  "MTP with inactive users" (confirmed before building this) means MTP
  lines tagged to a now-Inactive user, as a Finance/IT Admin-style cleanup
  view; it, Review Phase, Approval Phase and Fin Supported are all built
  scoped to MTP only (per their placement under the Medium Term Projection
  sidebar header), even though the underlying workflow is now shared by
  every kind — equivalent queue tabs for RB/OB/Block aren't built yet.
- MTP Variance's "last FY" baseline (`previousPeriods`) is frozen the
  moment a line is created (all zeros, matching "last FY the amount is 0")
  or the moment Medium Term Projection rolls over (a copy of the
  just-rolled figures) — not the literal prior fiscal year's submission by
  calendar lookup. A line's required justification is also enforced: it
  can't be submitted for Review (or resubmitted after a Clarification
  reject) while its earliest flagged year's justification is still empty.
- Review Phase and Approval Phase (and, by extension, Clarification (FM))
  needed a visibility rule different from `canSeeLine`'s tagged/team-member
  default, since a CIO-group user must see a line the instant it reaches
  Pending Approval (CIO) even without being tagged on it or a project team
  member — see `budgetLines.listActionQueue` in `client/src/api.ts`. A
  project's own MTP tab still uses the ordinary `canSeeLine` rule, so a
  CIO-group user who isn't tagged/a team member won't see the line there,
  only via Approval Phase — this seemed the more defensible reading of
  "these lines only appear when it requires the action of the particular
  role" than widening `canSeeLine` itself for CIO specifically.
- Authentication is out of scope; the Impersonate dropdown stands in for
  login, and anyone can impersonate anyone (there's no login/password of any
  kind gating who can pick which User).
- Line-level visibility (and every other permission check) is enforced in
  `client/src/api.ts`, not by a real trust boundary — since the whole app
  runs client-side against `localStorage`, anyone with devtools can read the
  raw data regardless of which user the UI is currently showing. This
  matches the rest of the app's access control, which was never intended as
  real security, only as an accurate simulation of the business rules.
