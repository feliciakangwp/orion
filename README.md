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
- The app seeds 19 named sample users (e.g. Felicia Kang — Super Admin,
  Branch Rep; Tan Sok Buay Tiffany — Finance Manager, Finance Admin, DY
  Head — several people hold more than one group) covering every group, so
  it's usable out of the box with realistic data. The original one
  starter-per-group placeholder Users (named after the group, e.g. "Branch
  Rep") are kept but seeded **Inactive**, so they're not selectable in the
  Impersonate dropdown — add more or reactivate them from User Management
  as needed.

## Where does the data live

Because this deploys as a static site (GitHub Pages), there is nowhere to
run a shared backend. All users, projects, funding entries, budget lines,
etc. are stored in **that browser's `localStorage`**, under the key
`orion.db.v10`. Practically:

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
- Right below it, **"Load Sample Data"** wipes and reseeds the local store
  too, then builds a rich demo dataset on top of it so every tab has
  something real to look at and act on:
  - **30 Project Profiles**: the original 3 hand-built ones — two Active
    (one IT — "Trade Declaration System Enhancement" — one not —
    "Checkpoint Scanner Replacement") and one still **Pending** ("Border
    Checkpoint CCTV Upgrade"), populating the **Project Profile Request**
    queue — plus 27 more Active ones generated in bulk: 5 "showcase"
    projects with an Approved, External Source of Funding (tuned to
    demonstrate **Project FY Status (External)**/**Project Loan Pot**,
    below) and 22 plain ones with an Approved, Internal Source of Funding,
    for volume. Every Active project has **10 Medium Term Projection
    lines** (and so 10 Original/Revised Budget lines and 10 Block Budget
    lines too, rolled forward automatically — see below); the Pending one
    has none yet, since nothing's been approved to attach a line to. There
    are also **10 ad hoc Medium Term Projection lines** (no Project
    Profile at all).
  - **AOR**: the IT project has two (a confirmed one plus a later,
    still-unconfirmed top-up — "+Add" and a live "Finance Confirmed"
    action to try); the other original Active project has one, also
    unconfirmed and smaller than what it ends up spending — AOR knock-off
    pools confirmed and unconfirmed funds alike, so both still drive the
    Insufficient AOR Balance highlight on their Original Budget lines.
  - **Project Funding Pot**: every Approved project's Source of Funding
    entry is promoted to an Approved catalog source and given real pot
    details (ID, Supported Fund, External Fund dates — required up front
    for an External entry, see below), so the page shows real FY-by-FY
    drawdown and a Funding Pot Balance for all of them — one of the
    original two negative, since its Original Budget spend outgrew its
    Supported Fund.
  - **Project FY Status (External)** (Finance Officer/Finance Manager
    only): the 5 showcase projects' current-cycle Revised Budget and
    next-cycle Original Budget totals are tuned to land on one each of
    **Excess** (two of them), **Deficit** (two of them), and **Balanced**
    (one) — see `setShowcaseFyAmounts` in `loadSampleData()`.
  - **Project Loan Pot** (same two groups): two loans between showcase
    projects, lending from an Excess one to a Deficit one — one left
    **Open** (with its auto-created Return Loan / Return from Loan lines
    already visible on the next FY's Original Budget), one **Closed**
    right away, to show both states.
  - **Seven Medium Term Projection lines** across the two original Active
    projects plus one ad hoc (no Project Profile), carried to seven
    different workflow stages — two fully Approved (one via the plain
    Reviewer-2-present path, one via the Reviewer-2-skip path), one each
    sitting at Clarification (FO), Clarification (FM), Review, and
    Pending Approval (Reviewer 2), and one still Draft — plus one line
    tagged to the generic Inactive "SMGT" placeholder user, populating
    "with Inactive Users" on all three exercises (see below). The other
    290-odd Medium Term Projection lines (10 per bulk project, plus the
    ad hoc ones) are plain, Recurring = Yes, single-FY-given filler lines
    — real volume to browse and page through, not narrated workflow
    states.
  - **Two Annual Budget cycles**, so Revised Budget has real rows too
    (empty on a lone first cycle is correct, not a bug, but isn't much to
    look at) — cycle 1 (FY25 Revised/FY26 Original) bootstraps Original
    Budget straight from Medium Term Projection and carries one line to
    Approved and one to Clarification (FO); cycle 2 (after a real
    `resetToDraft` + `open()`, exactly as Finance Admin would do it, and
    the cycle left active) duplicates cycle 1's Original Budget into this
    cycle's Revised Budget and bootstraps a fresh Original Budget from
    Medium Term Projection's now-updated figures, again carrying one line
    each to Approved and Clarification (FO) in both Revised and Original
    Budget. Cycle 2 lands on **FY26 Revised / FY27 Original** — matching
    the Simulation Year's own default of 2026, so "this year" reads as
    FY26 everywhere a page shows Annual Budget's current cycle (Project
    FY Status (External) and Project Loan Pot included) — see the note on
    the Simulation Date below.
  - **Block Budget**, rolled forward from Medium Term Projection's
    current (twice flowed-back) figures, with the same Approved/
    Clarification (FO)/Draft spread.
  - **One exercise ends Open** (Medium Term Projection — its pending
    lines and Draft line are all genuinely actionable/editable right
    away) **and the other two end Closed and Locked** (Annual Budget from
    its own real `lock()` call; Block Budget by the same direct period
    mutation its rollover already needed — see below) with real,
    read-only data, matching a steady-state demo rather than a blank
    exercise someone has to open themselves first.

  It's built by actually driving the real engine functions
  (`rollAnnualBudgetForward`, `flowOriginalBudgetIntoMtp`,
  `rollBlockBudgetForward`, and the same `submit`/`approve`/`update`/
  `open`/`lock`/`resetToDraft` calls the UI itself uses) rather than
  hand-written records, so every linkage matches the rules those
  functions already enforce — see `loadSampleData()` in
  `client/src/api.ts` for the exact script and its deliberate exceptions:
  Block Budget's rollover is called directly (bypassing the real
  `open()` action's requirement that every *other* exercise be Draft at
  that moment) since Annual Budget's cycle 2 has to stay non-Draft for
  its own lines to stay visible (see `belongsToCurrentCycle`), and the
  two can't both be non-Draft through `open()` itself. Block Budget's own
  exercise period is then bypassed the same way, straight to Closed and
  Locked with a real Start/End Date, rather than lingering at Draft.
  Cycle 1's own window (FY25/26) is also in the past relative to the
  browser's real clock by the time this runs, which would otherwise read
  as Closed for Submission and block every non-Finance actor (Branch Rep,
  Reviewer, CIO) from submitting/approving its lines — `loadSampleData()`
  briefly moves the Simulation Date back into that window for just that
  stretch, then restores it before cycle 2 opens (whose own window
  already covers the real "now").
- Nothing above is automatic: a fresh browser (or either of these two
  buttons) only ever produces what that button documents — every existing
  Playwright regression test assumes a truly blank slate on first load, so
  "Load Sample Data" is strictly opt-in, never triggered on its own.

If you need real shared/multi-user data, you'd need a real backend; `server/`
is a starting point but needs its own User/Group rewrite first (see above).

## Running locally

```bash
cd client
npm install
npm run dev
```

Open the printed `localhost` URL. On first run the app seeds 10 Users (one
per group, each with a placeholder `@orion.gov` email, all **Inactive**) plus
19 named sample Users covering every group (all **Active**), the 9-row
Source of Funding catalog (8 real entries + the system-only Mainstreaming
entry), a 22-row Account hierarchy (5 levels, Development and Operating
branches), 6 sample Cost Centres (each tagged a Finance Officer), the
Inflation Rate table (Non IT Item 3%, IT Item 5%), and the 3 Budget Period
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

- Every sidebar section (Project Profile, Medium Term Projection, Finance
  Admin, IT Admin) is **collapsed by default** — click a section's header
  to expand or collapse it, so the sidebar opens short.
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
    and a **Status** (Active/Inactive, toggleable). One entry,
    **Mainstreaming**, is seeded but never offered on either picker — it's
    system-computed only (see "Mainstreaming" below).
  - **Account** — a **Name** (code + description, e.g. `511604 ICT
    Consultation Services`), **Operating/Development**, a 5-**Level**
    hierarchy (L1 `5000 Development Expenditure` down to L5 `511604 ICT
    Consultation Services` — each level's code is a numeric prefix of the
    level below it), and a **Status** (Active/Inactive). Seeded with a
    full Development branch plus a mirrored dummy Operating branch. Only
    Level 5 (leaf), Active entries are offered on a budget line's Account
    dropdown; Finance Admin can change a row's Operating/Development and
    Status.
  - **Cost Centre** — **Display Name** (Code + Name), **Code**, **Name**,
    **Type** (NO01 Administration / NO02 Revenue / NO03 Preventive),
    **Nature of Expenditure** (Development/Operating), and a tagged
    **Finance Officer**. Seeded with 19 sample rows. Finance Admin can
    change a row's Type, Nature of Expenditure and Finance Officer.
  Finance Admin adds new entries to any of the three with **+ Add**. The
  Account and Cost Centre fields on every budget line (MTP/RB/OB/Block) are
  dropdowns populated from these two catalogs rather than free text.
- **Finance Admin → ICT Expenditure / Division / Sub Account** (same
  sidebar section) are three more plain catalogs:
  - **ICT Expenditure** — just a **Name** (seeded with 10 sample
    categories, e.g. Agency ICT Staff Cost, Software-as-a-Service).
    Populates a budget line's **ICT Expenditure Category** dropdown
    (shown only when "Is it an IT Project?" is Yes) — previously free
    text.
  - **Division** — just a **Name** (seeded with 7 sample divisions).
    Nothing else in the app references it yet.
  - **Sub Account** — **Sub Account Code** (always `Q` + 4 digits, e.g.
    `Q1095`), **Sub Account Name**, and a toggleable **Status**
    (Active/Inactive); seeded with 7 sample rows. Each Project Profile is
    assigned a unique Sub Account on its **Details** tab (Finance only,
    once Pending) — picking one from this catalog, same convention as
    Account/Cost Centre (`${code} ${name}`). A new budget line created
    from one of that project's own tabs (MTP/RB/OB/Block) then
    auto-populates its own Sub Account field from the project's, though
    the Branch Rep can still edit it afterward.
  Finance Admin adds new entries to any of the three with **+ Add**;
  ICT Expenditure and Division have no Status (nothing to toggle, per
  spec — just a name list).
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
    along to the new window automatically. The window's **first FY column
    is locked for edits** the moment the period isn't Draft (e.g. FY26 is
    locked for the whole FY26–40 window) — that FY's real figure comes
    from Annual Budget instead, the moment its Original Budget is
    approved and the cycle is Closed and Locked (see "Annual Budget"
    below); a brand-new line added after Medium Term Projection has
    already opened starts that FY at 0, same as any other blank period,
    and it stays locked there until Annual Budget flows a figure in.
  - Also adds a **Block Budget Start Year** field (for the Block Budget
    exercise only) — see "Block Budget" below.
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
  approval action itself — there's no separate "approve" button. An
  **External**-category entry has a **Show Fund Details** toggle revealing
  its **Funding Pot ID**, **Supported Fund** amount, **Fund Start/Expiry
  Date**, and **Project Development/Operating Cost Centre** — Finance
  (Officer/Manager/Admin) fills these in, not the Branch Rep, since they
  drive the Mainstreaming computation (see below). For an **External**
  entry, Finance can't actually promote it to Approved until all five of
  those pot-detail fields are filled in — approving one straight away
  creates a real funding pot (see **Project Funding Pot**, below), so the
  pot details have to exist already rather than being left for "later". An
  **Internal** entry has no such requirement (and no pot-details UI at
  all).
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
- **Annual Budget** (sidebar header) covers the RB (**Revised Budget Line
  Item**) and OB (**Original Budget Line Item**) kinds together, plus a
  **Budget Variances** tab and the same action-queue/cleanup tabs as Medium
  Term Projection (Review Phase; Clarification (FM) then Clarification
  (FO) — **note the reversed order from MTP's own section**, as given;
  Approval Phase; FIN Supported; Annual Budget with Inactive User), all
  scoped to RB+OB only. Revised/Original Budget Line Item tables add
  **Submission Year**, **Approved Original Budget** and **Total Variance**
  columns (and rename **Total** to **Total Budget Requested**) ahead of the
  Apr–Mar monthly columns; a Justification for Variance field lives only in
  Budget Variances, never inline on these tables, mirroring how MTP's own
  per-year justifications live only in MTP Variance.
  - **Revised Budget is always for the *current* FY; Original Budget is
    always for *next* FY** — e.g. opening the cycle in FY26 gives a
    Revised Budget for FY26 and an Original Budget for FY27 ("FY26's
    Original Budget was done in FY25"). **Opening Annual Budget** (Finance
    Admin → Budget Period) runs a rollover: last cycle's **Original
    Budget** line (which was, by the same rule, created *for this exact
    FY*) is plainly duplicated into this cycle's **Revised Budget** — the
    duplicate's own total, frozen as its `previousPeriods`, becomes
    **Approved Original Budget**; its live total (as the Branch Rep edits
    it) is **Total Budget Requested**; their difference is the
    system-computed **Total Variance**, which needs a **Justification for
    Variance** the moment it's nonzero (no percentage threshold, unlike
    MTP Variance). Matching is by **Submission Year**, not "every OB line
    ever", so a line from two cycles back is never mistaken for last
    cycle's.
  - Separately, this cycle's **Original Budget** (for *next* FY) lines are
    rebuilt by syncing against the current **Medium Term Projection**'s
    figure for that same FY: a last-cycle Original Budget line whose
    parent MTP line's amount there is now zero (or whose parent MTP line
    was removed entirely) is dropped; an MTP line with no existing
    Original Budget counterpart (new, or never synced before) gets added
    fresh, with Description, Project Title, Operating/Development,
    Account, Sub Account, Source of Funding, Recurring, Cost Centre, Is it
    IT Project?, ICT Expenditure Category, Build vs Buy and Basis of
    Projection pulled down from it — its own 12 monthly periods start at
    zero ("no comparison"), so Approved Original Budget/Total
    Variance/Justification for Variance are all blank for an Original
    Budget line; Total Budget Requested is just the sum of its 12 periods.
  - The very first Annual Budget cycle is a pure bootstrap case: no prior
    Original Budget line exists yet for the new cycle's Revised Budget FY,
    so Revised Budget starts empty and Original Budget is built entirely
    fresh from whatever's currently in Medium Term Projection.
  - Status follows the same Draft/Review/Clarification/Pending
    Approval/Approved workflow as every other kind; a freshly rolled RB/OB
    line always starts back at Branch Rep Draft for the new cycle, same as
    Medium Term Projection's own rollover.
  - Revised/Original Budget Line Item (and the other RB/OB-scoped tabs)
    only ever show the **current** Annual Budget cycle's lines — unlike
    Medium Term Projection, which rolls each line forward *in place* (same
    record, reused every cycle), Annual Budget creates a brand-new record
    per cycle, so past cycles' lines are filtered out of the active view
    (though they remain in Fin Supported, same as MTP's own accumulated
    history).
  - **Closing and Locking Annual Budget flows Original Budget back into
    Medium Term Projection**: every Approved Original Budget line's
    12-month total overwrites its linked MTP line's matching FY column
    (e.g. a FY27 Original Budget updates MTP's FY27 figure) — so the next
    time Medium Term Projection is rolled forward, that FY shows the real,
    approved Original Budget amount rather than whatever planning figure
    was there before. A line added by hand with no MTP link, or one whose
    linked MTP line's FY has already rolled out of its window, is left
    alone.
- **Block Budget** (sidebar header) covers the BLOCK kind on its own,
  pulled down from Medium Term Projection the same way Annual Budget's
  Original Budget is: **Budget Line Item**, **Budget Variance**, and the
  same action-queue/cleanup tabs as the other two exercises (Review Phase,
  Clarification (FM), Clarification (FO), Approval Phase, FIN Supported,
  Block Budget with Inactive Users).
  - Finance Admin sets a **Block Budget Start Year** (Budget Period) —
    the calendar year whose FY starts Block Budget's 5-FY window (e.g.
    2028 means FY28–FY32); it's independent of the exercise's own Start
    Date and must be set before Block Budget can be opened. Revised/
    Original Budget's reference years for a Block Budget line are always
    2 and 1 years before it (e.g. FY26/FY27 for a 2028 Start Year).
  - **Opening Block Budget** mirrors every current Medium Term Projection
    line into a Block Budget line covering those 5 FYs, with its catalog
    fields (Description, Project Title, Operating/Development, Account,
    Sub Account, Source of Funding, Recurring, Cost Centre, Is it IT
    Project?, ICT Expenditure Category, Build vs Buy, Basis of Projection)
    **and** those 5 years' actual MTP figures copied straight across —
    unlike Original Budget, there's no "remove if zero" rule, every MTP
    line gets (or keeps) a Block Budget line. A Block Budget line already
    linked to a given MTP line rolls forward **in place** (periods reset
    to the new window, step back to Branch Rep Draft) exactly like MTP's
    own rollover, rather than accumulating a fresh record every cycle the
    way Annual Budget's RB/OB do — Block Budget has no FY-submission
    concept to tell cycles apart by.
  - Budget Line Item's table is Status, Description, Project Title,
    Operating/Development, Account, Sub Account, Source of Funding,
    Recurring, Cost Centre, Is it IT Project?, ICT Expenditure Category,
    Build vs Buy, Basis of Projection, then two **read-only reference
    columns** — the matching Revised Budget total and Original Budget
    total for that same line (looked up by shared MTP linkage, not stored
    on the line) — then **Total Budget Requested** (the sum of just the 5
    Block FYs, never including the two reference columns), then the 5
    Block FY columns themselves.
  - **Budget Variance** compares each of the 5 Block FYs against the one
    immediately before it, **within the line's own window** (FY29 vs
    FY28, FY30 vs FY29, …) rather than against a separate prior-cycle
    snapshot — the window's first FY has nothing to compare against, so
    it's never flagged. Otherwise identical to MTP Variance: the same
    IT/non-IT Inflation Rate threshold, only the earliest flagged year
    needs a justification, and a line can't be submitted while it's
    missing.
- **Mainstreaming** — once a project's MTP budget period is **Closed for
  Submission** (or Closed and Locked), each of its Approved lines' Fin
  Supported duplicate is checked against that project's **External**,
  Approved Source(s) of Funding: the total **Supported Fund** amount is a
  pool spent, Financial Year by Financial Year, on that project's lines in
  **creation order** — **Development lines first, then Operating** — and
  any amount beyond what the pool still covers for that year (for either)
  is **Mainstreaming**, shown as an amber annotation under the affected
  period cell plus a **Mainstreaming Total** column. Once a FY is past the
  **earliest Fund Expiry Date** among those entries, that year and every
  year after it is 100% Mainstreaming regardless of remaining pool. This
  is computed live every time Fin Supported is read (see
  `lib/mainstreaming.ts` / `api.ts`'s `finSupportedLines.list`) — never
  stored — so it always reflects the latest figures and fund details.
- **Simulation Date** (top bar, next to Simulation Year) is a global
  "pretend today is this date" setting with a native calendar picker and a
  **Today** button to snap back to the real current date. Budget Period's
  Closed for Submission transition (and so Mainstreaming) is evaluated
  against this date, not the browser's real clock, so you can test
  deadline behavior without waiting.
- **AOR** (a Project Profile tab) — a project can have more than one AOR
  (e.g. a later top-up), each with **AOR Approved By** (an SMGT user),
  **AOR Approved Date**, **Development Approved Fund**, **Operating
  Approved Fund**, **Total AOR Approved Amount** (computed, Dev +
  Operating), **AOR Start Date**, **AOR Expired Date**, and **Finance
  Confirmed**. Branch Rep (owning, or any team member) keys the details
  in and adds further AORs with **+ Add**; Finance Officer or Finance
  Manager ticks **Finance Confirmed**, which locks every field for
  everyone from then on.
- **Project AOR** (sidebar: Project Profile → Project AOR) lists every
  **Finance-Confirmed** AOR the acting user can see (same visibility as
  Project Profile itself): Project Title, Total/Development/Operating
  Approved Amount, Start/Expired Date — highlighted red when its Expired
  Date falls in the current FY. Clicking a row opens its own page: Year
  (derived from Start Date), Status (**Active**/**Closed**/**Expired** —
  Closed once the AOR's own balance is fully spent, Expired once its own
  Expired Date has passed, computed by running every one of the
  project's AORs as a waterfall, earliest Start Date first, against its
  lifetime Original Budget spend — see `lib/aor.ts`), Total/Development/
  Operating Approved Amount with remaining balance, and a monthly
  transaction ledger (every Original Budget month ever submitted for
  that project, split Development/Operating).
- **Insufficient AOR balance** — on an Original Budget line (Budget Line
  Item, either the per-project tab or Annual Budget's own cross-project
  page), if a project's Development or Operating total spend (summed
  across every Original Budget line of that type, any cycle) exceeds the
  combined fund of every AOR for that project (confirmed or not), the
  line is highlighted red with an "Insufficient AOR balance" note.
  Submitting/approving still goes through — it's a warning for Branch Rep
  to raise a top-up or another AOR, not a block — and it clears the
  moment a new (even unconfirmed) AOR brings the pool back above spend.
- **Project Funding Pot** (sidebar: Project Profile → Project Funding
  Pot) lists every **Approved** Source of Funding entry across every
  visible Project Profile — one row per entry (a project with more than
  one Approved Source of Funding pick shows more than one row); a
  Pipeline entry isn't a real pot yet, so it's left off entirely — with
  **Funding Pot ID**, **Status** (**Active**/**Closed**/**Expired**,
  computed the same way as AOR's own status: Closed once its Funding Pot
  Balance reaches zero, Expired once its External Fund End Date has
  passed, Active otherwise), **Project Title**, **Source of Funding**,
  **External Fund Start/End Date**, **Supported Fund**, **Funding Pot
  Balance** (Supported Fund minus Total Budget Drawn Down), **Total
  Budget Drawn Down**, and one column per FY that has ever had an
  Original Budget. Each FY column — and so the Total/Balance too — is
  that **project's** total Original Budget for that FY (summed across
  every line, every cycle, the same "lifetime ledger"
  `listAllForProject` already powers for the insufficient-balance check
  above), not scoped to the specific line(s) that happened to tag this
  particular funding entry — same pooled, project-level approach as the
  AOR knock-off, for the same reason (the spec asks for "the total
  Original Budget of the Project profile," and a project's Original
  Budget spend draws against its funding sources collectively, not
  line-by-line against whichever pot it happened to be tagged to).
- **Project FY Status (External)** (sidebar: Project Profile → Project FY
  Status (External); **Finance Officer/Finance Manager only**) tracks
  every project with an Approved, External Source of Funding against this
  FY's Annual Budget cycle, as **Project Title**, **Current Status** (the
  project's own lifecycle status), **Status**, **FY Original Budget**,
  **FY Revised Budget**, **Differences**, and **Total Loan Amount**. FY
  Original/Revised Budget are that project's own Original/Revised Budget
  totals for the Annual Budget exercise's current Original/Revised Budget
  FY respectively (e.g. with the exercise on FY26 Revised/FY27 Original —
  the sample data's own current cycle — it's each project's FY27 Original
  Budget total and FY26 Revised Budget total) — not the same FY compared
  against itself, since Original and
  Revised Budget are always exactly one FY apart (see
  `currentOriginalBudgetYear`/`currentRevisedBudgetYear`). **Differences**
  is FY Original Budget minus FY Revised Budget; **Status** is
  **Balanced** at exactly 0, **Deficit** when negative, **Excess** when
  positive. **Total Loan Amount** is the sum of every Project Loan Pot
  loan where this project is the borrower (Loan To).
- **Project Loan Pot** (sidebar: Project Profile → Project Loan Pot; same
  two groups) lists every loan as **FY**, **Status** (**Open**/
  **Closed**), **Loan From**, **Loan To**, **Loan Amount**, plus a **New**
  button. **Loan From** only offers projects currently showing **Excess**
  on Project FY Status (External); **Loan To** only offers ones showing
  **Deficit**; the amount is capped at the Loan From project's Excess
  figure. Creating a loan is immediate and synchronous — it books the
  repayment there and then as two new Original Budget lines: the borrower
  (Loan To) gets a **Return Loan** line for +amount, the lender (Loan
  From) gets a **Return from Loan** line for -amount, both landing on the
  FY right after the loan's own Budget Period (the Original Budget FY in
  view when the loan was created) — or the next one after that still
  open, if that FY's Original Budget is already Closed and Locked. A loan
  starts **Open** and can be marked **Closed** once its return lines
  exist, which in practice is always true immediately — there's no
  separate "the lines haven't been created yet" state to wait out.
- **Mass Submit / Mass Approve / Mass Reject / Mass Delete / Mass
  Reassign** — every Budget Line Item row (per-project tab or
  cross-project page) and every Review Phase / Approval Phase /
  Clarification (FM) action-queue row shows a checkbox, plus Branch Rep /
  Reviewer 1 / Reviewer 2 / Approver columns — there is no per-row
  Submit/Approve/Reject/Delete button any more; every action lives in one
  toolbar at the top of the page, next to **+ New**/**+ Add**. Ticking one
  or more rows reveals it:
  - **Submit Selected** (Budget Line Item pages only) submits every
    ticked line the acting Branch Rep owns.
  - **Approve Selected** approves every ticked line the acting user
    currently has a turn on.
  - **Reject Selected** rejects every ticked line the acting user
    currently has a turn on.
  - **Delete Selected** (Budget Line Item pages only) deletes every
    ticked line that's still **New** (see below) and owned by the acting
    Branch Rep.
  - **Reassign Selected** opens a bulk modal listing every ticked line
    side by side, each with its own Branch Rep (ad hoc lines only),
    Reviewer 1, Reviewer 2, and Approver dropdowns, pre-filled with its
    current values — change any of them and **Save All** applies every
    row in one go.
  A mixed batch (some lines the user isn't actually eligible to act on)
  still processes whichever ones succeed; the rest are reported back as
  a single error message rather than blocking the whole batch. Anyone
  who can currently see a line — not just its own Branch Rep — can
  reassign it, regardless of the line's workflow step; reassigning a
  role away from yourself means you naturally stop seeing that line
  afterward.
- **New vs. Draft.** A budget line that has never been submitted (empty
  history) shows status **New**; once it's been through the workflow at
  least once and comes back to the same Branch-Rep-editable step (a
  reject, or a Return), it shows **Draft** instead, even though it's the
  same underlying workflow step. Only a **New** line can be deleted
  (Delete Selected, above) — a line that's already picked up reviewer/
  approver history can still be edited from Draft, but not removed
  outright.
- **Reviewer 2 is optional.** A line can be submitted with no Reviewer 2
  at all — Clarification (FM)'s approval then skips Pending Approval
  (Reviewer 2) entirely, going straight to CIO (IT project) or Approver.
  Clearing Reviewer 2 back to "—" through Reassign means the same thing
  going forward: if the line is sitting at Pending Approval (Reviewer 2)
  at that exact moment, it auto-advances immediately (there'd otherwise
  be no one left able to act on it); if it hasn't reached that step yet,
  it naturally skips it once it does.
- **Project visibility**: Project Profile, Project AOR, and a project's
  own AOR tab all follow the same rule as a budget line — Branch Rep only
  sees a project they opened or are a team member of; Finance (Officer,
  Manager, or Admin) sees every one. **Team Members**: any current team
  member (not just the owning Branch Rep) can add further team members;
  a newly-added member immediately sees every one of that project's
  lines, past history included, since visibility is a live team-
  membership check, not a point-in-time grant.

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
  every kind — Annual Budget later got its own RB+OB-scoped copies of all
  four (see below); an equivalent set for Block Budget isn't built yet.
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
- Mainstreaming's external-fund ceiling and expiry live on each project's
  **FundingEntry** (Funding Pot ID/Supported Fund/Fund Start-Expiry
  Date/Development-Operating Cost Centre — confirmed before building
  this), not as a single flat amount on the Project itself. A project with
  more than one External, Approved entry has its **total** Supported Fund
  summed across them and the **earliest** of their Fund Expiry Dates
  governs the cutoff — the spec described a single pot, so this is a
  simplifying rule for the (presumably rare) multi-pot case. Only
  **Approved**-maturity External entries count; a still-Pipeline one
  doesn't yet constrain anything.
  "Development takes priority over Operating" (confirmed before building
  this) is applied **per Financial Year**: each year's pool first pays
  every Development line (in the project's line-creation order), then
  whatever's left pays Operating lines, before moving to the next year —
  not "every Dev line, every year, before any Ops line at all."
  The Development/Operating Cost Centre fields captured alongside a
  funding pot's other details are informational only; the waterfall itself
  keys off each budget line's own existing Ops/Dev field, not a cost
  centre lookup.
- "Create some dummy data to have more account codes" filled out the
  Development branch's gaps (extra Manpower/Asset Acquisition leaves) and
  added a parallel dummy Operating branch (`6000` Operating Expenditure
  down to leaves like `611101` Basic Salaries), so both natures have real
  options; none of this was in the spec's own example. The account
  hierarchy's levels are inferred purely from each code being a numeric
  prefix of its parent's — there's no stored parent id, so renumbering a
  code would silently detach it from its branch.
- Authentication is out of scope; the Impersonate dropdown stands in for
  login, and anyone can impersonate anyone (there's no login/password of any
  kind gating who can pick which User).
- Line-level visibility (and every other permission check) is enforced in
  `client/src/api.ts`, not by a real trust boundary — since the whole app
  runs client-side against `localStorage`, anyone with devtools can read the
  raw data regardless of which user the UI is currently showing. This
  matches the rest of the app's access control, which was never intended as
  real security, only as an accurate simulation of the business rules.
- Annual Budget's Original Budget ↔ Medium Term Projection link is tracked
  with a new, explicit field — `sourceMtpLineId` on `BudgetLine` — rather
  than matching on description text or some other fuzzy heuristic, since
  nothing like it existed before and text-matching would silently break
  the moment a description changed. It's set the moment an Original Budget
  line is created (or carried forward) from a specific MTP line, and left
  `null` for a Revised/Original Budget line added by hand with no MTP
  counterpart.
- "Last FY Original Budget" for the Revised Budget duplicate, and for
  deciding which Original Budget lines carry forward, is matched by
  **Submission Year** (`newYear - 1`), not "every Original Budget line
  that currently exists" — so a line from two or more cycles back is never
  mistaken for last cycle's, and the very first cycle (no matching
  Submission Year at all) cleanly falls through to the bootstrap case
  (empty Revised Budget, Original Budget built fresh from Medium Term
  Projection).
- The Revised Budget duplicate-on-rollover is a plain copy with no
  MTP-sync logic — only Original Budget re-syncs against Medium Term
  Projection (remove-if-zeroed, add-if-new) — read directly off the spec's
  own wording, which described the MTP check only for point 2 (Original
  Budget), not point 1 (Revised Budget).
- A newly-synced Original Budget line's 12 monthly figures start all-zero
  (the Branch Rep fills them in from scratch) rather than auto-distributing
  the Medium Term Projection line's yearly figure across months — chosen
  for consistency with "no comparison" and with how an ad hoc MTP line
  already starts at zero.
- The literal column order given for Revised/Original Budget Line Item —
  Status, Submission Year, Budget Type, Description, ..., Approved
  Original Budget, Total Budget Requested, Total Variance, then the
  monthly columns — is followed exactly for the three new financial
  columns (which land immediately before the monthly columns, as given)
  and for Submission Year (immediately after Status); the remaining
  catalog columns (Budget Type, Operating/Development, Account, etc.) keep
  the relative order the shared `BudgetLineRow` component already used for
  Medium Term Projection, rather than being reshuffled to match the spec's
  exact sequence, to avoid a second, diverging layout for the same shared
  row component.
- Justification for Variance is surfaced only in the **Budget Variances**
  tab, never as an inline column on Revised/Original Budget Line Item —
  the spec's own column list for those two tables doesn't include it, and
  this mirrors how MTP's per-year justifications live exclusively in MTP
  Variance, never inline on Medium Term Projection's own Budget Line Item
  table.
- Budget Variances only ever lists **Revised Budget** lines — an Original
  Budget line structurally has no prior submission to vary from (Approved
  Original Budget is always blank for it), so it can never appear there,
  even though the spec's "pull down all the Annual Budget lines that
  require variance" could be read as covering both kinds.
- Medium Term Projection's new first-FY-column lock is enforced
  unconditionally for every MTP line, old or brand-new, the moment the
  period isn't Draft — a line created *after* Medium Term Projection has
  already opened for a cycle starts that FY at 0 and it stays locked
  there (rather than, say, exempting new lines) until Annual Budget flows
  a real figure in; this reads the spec's own example ("FY26 will be
  locked for edit") as an unconditional rule about the column, not about
  which lines already existed when the period opened. The lock is
  enforced both client-side (the input is disabled) and server-side
  (`budgetLines.update` silently clamps any attempted change back),
  the latter being defense-in-depth that isn't reachable through the UI
  itself to exercise in testing.
- The Original-Budget-approved-total flow-back (on closing and locking
  Annual Budget) only ever touches a line's **own** linked MTP line, and
  only once — overwriting the exact FY it was approved for. If that FY
  has already rolled out of the MTP line's current window (e.g. Medium
  Term Projection has moved on several cycles since), the flow-back is
  silently skipped for that line rather than erroring, since there's
  nothing left on Medium Term Projection to update.
- Block Budget rolls forward **in place** (same record reused every
  cycle, exactly like Medium Term Projection's own rollover) rather than
  accumulating a fresh record every cycle the way Annual Budget's RB/OB
  do. This was a deliberate departure from the Annual Budget precedent:
  Block Budget has no FY-submission field to tell cycles apart by (its
  spec, unlike Original Budget's, gives no "remove if zero"/"add if new"
  rule to build that distinction from), so a fresh-record-per-cycle
  design would mean the same MTP line's Block Budget line duplicating
  forever across cycles with no way to tell which is current short of
  adding a submission-year concept the spec never asked for.
- A Block Budget line's Revised Budget/Original Budget reference columns
  (labelled by whichever FYs the Block Budget Start Year implies, e.g.
  FY26/FY27 for a 2028 Start Year) are computed live by looking up other
  lines sharing the same linked MTP line and the expected Submission
  Year — never stored on the Block Budget line itself — so they always
  reflect whatever Annual Budget has actually recorded for those FYs, and
  read as blank (not zero) if no such Annual Budget cycle has run yet.
- Block Budget's own cross-project Budget Line Item/Budget Variance pages
  get the full bespoke column layout from the spec (including the two
  reference columns and the mid-table Total Budget Requested position);
  the pre-existing per-project Block Budget tab (inside a Project
  Profile's own tabs, predating this round) keeps its original generic
  layout rather than being retrofitted with the same cross-record lookups
  — the spec's detailed column list was given specifically for the new
  header's own "Budget Line Item" tab.
- ICT Expenditure and Division are built as pure add-only lists (no
  Status, no edit, no delete) since the spec described their tables as
  having only a Name column and a button to add new — unlike Account/Cost
  Centre/Source of Funding, which do have an explicit Status field. Sub
  Account does get Status (Active/Inactive, toggleable), since the spec
  explicitly listed it as a column.
- The 13 new Cost Centre rows' **Type**, **Nature of Expenditure** and
  **Finance Officer** were only given as a Display Name (code + name) —
  Type/Nature were inferred per branch from its name (e.g. "IT
  Application & Technical Services" as Development, most others as
  Operating; checkpoint/investigation branches as NO03 Preventive,
  trade/operations branches as NO02 Revenue, everything else as NO01
  Administration), and Finance Officer was round-robined across the
  three existing Finance Officer users, same as the original 6 sample
  rows' pattern — none of this was specified.
- A budget line's Sub Account auto-populates from its owning project's
  Sub Account only when created from **that project's own tabs**
  (`budgetLines.create`, the "+ New" button inside a Project Profile) —
  not from the cross-project ad hoc creation flows (Medium Term
  Projection/Annual Budget/Block Budget's own "Budget Line Item" pages,
  where a line may not even be attached to a project yet). This matches
  the spec's own wording, "when a new Budget line is created from the
  tabs in Project Profile."
- The Sub Account code's "`Q` + 4 digits" shape (e.g. `Q1095`) is
  enforced only as sample data and a placeholder hint on the Add form —
  Finance Admin can still type anything, same as every other catalog's
  free-text code field (Account, Cost Centre) having no format
  validation either.
- An AOR's fund counts toward the Original Budget insufficient-balance
  check the moment it's added, whether or not Finance has ticked Finance
  Confirmed yet — only the cross-project **Project AOR** listing itself
  is confirmed-only (per spec: "when the AOR is filled and confirm... it
  will create the line in the Project AOR"). Finance Confirmed is read as
  Finance's own lock-in step, not the moment the fund becomes real for
  knock-off purposes.
- An AOR's "Year" and "Status" are always derived (from Start Date, and
  from a waterfall balance check against lifetime Original Budget spend,
  respectively), never their own stored/editable fields — the spec's
  field list for the AOR tab itself didn't include either, and Status
  was only described for the Project AOR detail view.
- A project's AORs are treated as a single waterfall per fund type,
  ordered by Start Date (earliest first): spend knocks off the first
  AOR's fund before spilling into the next one's. This was necessary to
  give "Closed" (fully spent) and remaining-balance a definite meaning
  once a project has more than one AOR, since the spec describes the
  knock-off for "the AOR" in the singular. The simpler insufficient-
  balance warning on Original Budget, by contrast, just pools every
  AOR's fund for that type and compares it against total spend — it only
  needs "is there enough overall," not which specific AOR covers it.
- "Monthly expense" on the AOR ledger is Original Budget spend only
  (never Revised Budget or any other kind) — matching "When Branch Rep
  budgets for annual budget, it will knock off from the funds approved
  from the AOR" being described right alongside "when Branch Rep is
  budgeting for Original Budget" in the very next paragraph, and it
  accumulates across every Annual Budget cycle ever run for the project
  (not just the current one), since an AOR's balance is a lifetime
  ledger, not a per-cycle one.
- The "expiring that FY" red highlight on Project AOR compares the AOR's
  Expired Date's FY against the current Simulation Date's FY (both via
  the same `fyOfDate` used everywhere else in the app), not calendar-year
  or days-remaining — consistent with how every other "this FY" concept
  in ORION is computed.
- Reassign (now a mass action — tick lines, then Reassign Selected) is
  available on every Budget Line Item row and on Review Phase/Approval
  Phase/Clarification (FM)'s action-queue rows (where "pending action
  for them" visibility already applies), gated server-side by the same
  `canSeeLine` check that already governs whether a line is visible to
  the acting user at all — there's no separate, narrower "who can
  reassign" permission, since by the spec's own wording ("accessed by
  those who have access to the lines") visibility already is the
  permission.
- Reassigning the "Branch Rep" only changes anything for an **ad hoc**
  line (no Project Profile) — a project-attached line's Branch Rep is
  always the Project Profile's own opener (`isOwningBranchRep` is keyed
  off the project, not the line), so the bulk Reassign modal only offers
  that control for ad hoc lines; a project-attached line's row in the
  modal shows "follows Project Profile" instead and offers just
  Reviewer 1/2 and Approver.
- Mass Submit/Approve process each ticked line independently (one
  `try`/`catch` per line) rather than all-or-nothing, since a batch
  ticked by one actor can legitimately contain lines they're not
  actually the current turn for (e.g. ticking across several rows before
  checking who's eligible) — the spec's "tick the lines they want to
  send for review or for approver" reads as a convenience for acting on
  many eligible lines at once, not a transaction that should fail
  entirely over one ineligible line.
- Making Reviewer 2 optional did **not** add a schema field — a line's
  `reviewer2UserId` was already `string | null` from the original model,
  so this round is purely workflow-engine and permission-check changes
  (skip the step when null; auto-advance if it's cleared while a line is
  sitting on it) plus the UI changes described above; no `orion.db`
  version bump was needed.
- Project Profile's own visibility fix (Branch Rep sees only projects
  they opened or are a team member of) was applied to the **listing**
  endpoints only (`projects.list`, used by Project Profile and Project
  AOR) — direct navigation to a project's own URL by someone without
  access isn't blocked, consistent with how every other page in ORION
  enforces visibility through filtered listings and field-level
  permission checks rather than a route-level hard deny.
- "Load Sample Data" is a **separate** button from "Reset Demo Data"
  rather than the same one gaining sample data by default, because every
  existing Playwright regression test launches a fresh browser profile
  and assumes it starts truly empty — making sample data automatic would
  have broken all of them. The one time it can't call the real,
  permission-gated `api.budgetPeriods.open('BLOCK', ...)` action (which
  demands Medium Term Projection *and* Annual Budget both be Draft at
  that moment — impossible once Annual Budget is deliberately kept
  non-Draft so its own Original/Revised Budget lines stay visible), it
  calls the exact same internal rollover function that action would have
  called, directly — never a hand-written substitute — and then bakes
  Block Budget's own exercise period straight to Closed and Locked with
  a real Start/End Date the same direct way (confirmed safe: a real
  Finance Admin re-running the rollover later, e.g. by Resetting to
  Draft and clicking Open for real, would just update each existing
  Block line in place, never duplicate it).
- Exactly one exercise (Medium Term Projection) ends "Load Sample Data"
  Open and the other two Closed and Locked, rather than all three Open
  or all three Locked, because that's the only combination that leaves
  *all three* genuinely showing real data: Annual Budget's Original/
  Revised Budget only stay visible while its own period is non-Draft
  (see `belongsToCurrentCycle`), and the real `open()` action refuses to
  open a second exercise while any other is already non-Draft — so
  Annual Budget and Block Budget can never both be "freshly opened" in
  the same live session, only reached one after the other, each only
  staying visible by staying non-Draft once reached. Medium Term
  Projection has no such restriction (`belongsToCurrentCycle` never
  filters it), so it's the one left Open rather than Locked, so its
  pending lines and Draft line stay genuinely actionable/editable for
  a visitor to try immediately rather than all three exercises reading
  as finished history.
- Project 2's own AOR (Development 50,000 / Operating 30,000) and the
  Development-only top-up on Project 1's AOR (30,000) are sized to stay
  smaller than what their Original Budget lines actually spend, on
  purpose — demonstrates the Insufficient AOR Balance highlight staying
  intact (and, for Project 1's Operating fund, a contrasting *sufficient*
  case) even once a real AOR exists and even after a top-up, since the
  check pools every AOR for the project regardless of Finance Confirmed
  status.
- The generic, one-per-group placeholder Users (each named after their
  own group, e.g. "SMGT") are seeded Inactive specifically so something
  already exists to populate every "with Inactive Users" cleanup page
  without inventing a new, otherwise-pointless Inactive User —
  `loadSampleData()` tags one line each on Medium Term Projection,
  Annual Budget, and Block Budget to the "SMGT" placeholder. For Annual
  Budget specifically, the tag goes on the *Revised* Budget line from
  cycle 2, not that line's Original Budget counterpart from cycle 1 —
  tagging the latter would work at the time, but the moment cycle 2
  opens, cycle 1's Original Budget stops being "the current cycle" (see
  `belongsToCurrentCycle` again) and disappears from every Annual Budget
  listing, taking the demo with it.
- An Original Budget/Revised Budget line inherits Medium Term
  Projection's own Recurring flag on bootstrap (same field, same
  record-construction code as every other catalog field it carries
  down) — but Recurring's growth formula is written in terms of
  generic period index, so applying it to Annual Budget's 12 *months*
  within one FY (instead of MTP/Block's multiple FY *years*) grows each
  month as if it were "a year later" at the IT/non-IT rate, which isn't
  a reasonable real-world outcome for a flat-ish monthly spend profile.
  This looks like a genuine latent inconsistency in how Recurring was
  carried over to Annual Budget, predating this round and out of scope
  to fix here — `loadSampleData()` simply avoids triggering it by
  switching Recurring off before setting an Original Budget line's own
  monthly figures, exactly as a real Branch Rep editing one would need
  to.
- Project Funding Pot's **Status** column (Active/Closed/Expired) isn't
  specified by name in the spec, so it reuses AOR's own status model
  rather than inventing a different one: Closed once the Funding Pot
  Balance reaches zero (or below — a pot can go negative, since nothing
  in the spec caps draw-down at the Supported Fund, and a negative
  balance is itself useful information, not an error state to hide),
  Expired once its External Fund End Date has passed, Active otherwise.
- Project Funding Pot shows **one row per Source of Funding entry**, not
  one per project, since Funding Pot ID/Source of Funding/Supported
  Fund/the External Fund dates are all per-entry fields — a project with
  more than one entry (more than one pot) shows more than one row, each
  with the *same* FY/Total Drawn Down/Balance figures, since the
  draw-down itself is pooled at the project level (see the Feature map
  entry above) rather than split by which specific entry a budget line's
  own `fundingEntryId` happens to point to.
- The FY columns shown are the union of every FY any visible project has
  ever had an Original Budget for — not, say, a fixed recent window —
  since different projects' Annual Budget history can start in different
  FYs and the page has no natural "current FY" of its own to center on
  (unlike Medium Term Projection/Block Budget, which each have exactly
  one active window).
- Project FY Status (External)'s **Current Status** and **Status**
  columns both being asked for, with the computation only described for
  one of them, is read as: **Current Status** is the Project Profile's
  own lifecycle status (Active, in practice, since only an Active project
  can have an Approved Source of Funding), and **Status** is the
  Balanced/Deficit/Excess figure the spec actually describes the
  computation for — two different pieces of information, not a
  duplicate column.
- A loan's **Budget Period** is read as the Original Budget FY that
  Project FY Status (External) is evaluating *at the moment the loan is
  created* (`currentOriginalBudgetYear()`), rather than the real-world
  calendar FY — this keeps the loan and the page that drives it looking
  at the same FY, and the spec's own worked example ("this year is FY26")
  is consistent with either reading since the example never puts the two
  dates in tension.
- A loan's repayment lines are inserted directly as new, plain Original
  Budget records (not routed through Medium Term Projection's own
  rollover) — nothing elsewhere in the app assumes at most one Original
  Budget line per (project, FY), so this doesn't conflict with anything,
  and it matches the spec's "a line will be created" wording more
  directly than retrofitting it through the MTP bootstrap path would.
- `loadSampleData()`'s 27 bulk-generated Project Profiles' Medium Term
  Projection lines are plain, Recurring = Yes, single-FY-given filler
  lines — not driven through the submit/approve workflow by hand the way
  the three original narrated projects' seven lines are. Original/
  Revised/Block Budget line *existence* doesn't depend on that (the real
  rollover functions mirror every Medium Term Projection line regardless
  of its workflow step), so this was enough to satisfy "10 Annual Budget,
  10 Block Budget" per project without hand-authoring hundreds of
  workflow states that the spec never asked for.
- "Draft lines can't be deleted, only New ones can" is read as: **New**
  means never submitted (empty `history`), distinct from **Draft**
  meaning the same workflow step after a reject or a Return sent a line
  back there. The app has one underlying `DRAFT` workflow step either
  way (reusing it, rather than adding a second step, keeps every
  existing permission/visibility rule that already keys off `DRAFT`
  working unchanged) — `statusFor()` is what tells them apart for display
  and for the delete check, based on whether the line has ever picked up
  a history entry.
