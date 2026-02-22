# Architecture Decisions

## 2026-02-22: Staging/production persistence is database-only with hard-fail on DB errors
- Decision: For `APP_ENV=staging|production` and `VERCEL_ENV=preview|production`, application data stores now require database persistence and do not fall back to filesystem (`data/`, `/tmp`) for reads or writes.
- Rationale: Vercel serverless filesystems are ephemeral and instance-local; fallback writes created false-success saves that disappeared on subsequent requests.
- Tradeoffs: Misconfigured or unavailable database now causes explicit non-200 API failures (`PERSISTENCE_DB_*`) instead of silent fallback behavior, which is stricter but correct for durable workflow data.

## 2026-02-22: Serverless JSON persistence promoted to Postgres-backed shared store
- Decision: Route JSON-backed module persistence through a shared `JsonStore` Postgres table (keyed by store filename) via `safePersistJson` + `safeReadJsonText`, with filesystem fallback preserved for local development.
- Rationale: Vercel/serverless functions do not share local filesystem state across routes, which caused writes to appear successful but disappear on subsequent reads in other functions.
- Tradeoffs: Runtime uses lightweight SQL upsert/query for JSON blobs (not yet fully normalized domain tables), so data durability is restored immediately while keeping existing store interfaces stable.

## 2026-02-22: STRATOS Copilot moved to schema-first artifact generation with strict context injection
- Decision: Add a dedicated `/api/copilot` endpoint that enforces project-scoped context grounding, role-aware artifact generation permissions, and schema validation/retry for canonical STRATOS artifacts.
- Rationale: Governance workflows require deterministic, auditable artifacts and prevention of hallucinated project facts; the old prompt style was too permissive for enterprise control needs.
- Tradeoffs: Existing artifact storage enum (`TASKS/RISKS/KPIS/EXEC_SUMMARY`) is retained for compatibility, so semantic artifact types are mapped into payload metadata (`artifactType`) instead of changing DB enums immediately.

## 2026-02-22: Staging isolation profile with notification safety guardrails
- Decision: Add a dedicated staging deployment profile (`APP_ENV=staging`) with explicit public test guide, staging seed accounts, and outbound notification safe mode (email redirect sink + Teams disabled/redirect-only).
- Rationale: Stakeholders need full workflow testing on a public URL without sending live notifications or touching production data/users.
- Tradeoffs: Runtime still uses JSON-backed operational stores for core workflow data in this phase, so staging persistence follows deployment storage constraints; Prisma staging seed covers identity/role fixtures and future DB-backed modules.

## 2026-02-10: Monolithic Next.js (App Router) for UI + API
- Decision: Use a single Next.js app for frontend and backend route handlers.
- Rationale: Fastest path to production while keeping deployment and auth integration simple.
- Tradeoffs: Less service isolation than separate backend; can extract APIs later if scale requires.

## 2026-02-10: NextAuth Credentials for Milestone A bootstrap
- Decision: Start with NextAuth credentials and in-memory demo users for role testing.
- Rationale: Enables immediate role-gated UX and server-side auth flows before database onboarding.
- Tradeoffs: Not production identity; Milestone B will move identities into PostgreSQL and hashed credentials/SSO.

## 2026-02-10: RBAC checks enforced server-side
- Decision: Validate roles in server components/route handlers, not only client navigation.
- Rationale: Prevents privilege escalation via direct URL/API access.
- Tradeoffs: Requires shared guard helpers and more explicit checks across routes.

## 2026-02-10: Red/white/grey executive UI system
- Decision: Define brand palette via Tailwind theme extension.
- Rationale: Matches requested executive aesthetic and keeps component styling consistent.
- Tradeoffs: Additional design token maintenance as UI grows.

## 2026-02-10: Interim JSON store for intake capture before database milestone
- Decision: Persist intake submissions in `data/submissions.json` behind server route handlers.
- Rationale: Enables immediate working intake and financial capture without blocking on Milestone B database migration.
- Tradeoffs: Not multi-instance safe and not suitable for production HA; will be replaced by Prisma/PostgreSQL in Milestone B.

## 2026-02-10: Autosave draft pattern for intake editing
- Decision: Use client-side debounced autosave (1.5s) to PATCH draft records, with explicit Save Draft and Submit actions.
- Rationale: Reduces data-loss risk while preserving clear user intent for final submission.
- Tradeoffs: More API calls while editing; acceptable for current scale and will be optimized with persistence layer in Milestone B/C.

## 2026-02-10: Deterministic in-app AI helper before external LLM integration
- Decision: Implement a domain-aware rules-based "Portfolio Copilot" endpoint and UI using project data, without external model dependencies.
- Rationale: Gives immediate AI-assistant value (summary, risk flags, recommendations) while keeping security/simple local setup.
- Tradeoffs: Less flexible than a full LLM; we can swap in model-backed responses later behind the same API contract.

## 2026-02-10: Portal UX shell v2 (collapsible nav, avatars, notifications, theme controls)
- Decision: Centralize UX controls in `PortalShell` and keep business pages simple.
- Rationale: Ensures consistent global behavior (notifications, theme mode, floating AI) across all portal routes.
- Tradeoffs: Larger shell component; acceptable for current scope and can be split later.

## 2026-02-10: CaseID standardized to SP-YYYY-###
- Decision: Replace previous BC format with `SP-YYYY-###` generator.
- Rationale: Matches strategic-portal naming and cleaner human readability.
- Tradeoffs: Existing previously-created IDs are not migrated automatically in local demo data.

## 2026-02-10: Workflow normalized to stage-gate model requested by operations
- Decision: Standardize to stages `Placemat Proposal` -> `Request Funding` -> `Change Request (if required)` with statuses `Draft`, `Submitted`, `Sent for Approval`, `Approved`, `Rejected`, `Returned to Submitter`, `Deferred`, `Cancelled`.
- Rationale: Aligns portal language with business process and enables sponsor decision controls.
- Tradeoffs: Legacy data is normalized on read; there is no explicit migration history table yet.

## 2026-02-10: Finance/Governance operational board introduced as first-class collaboration module
- Decision: Add dedicated operations workspace with Kanban and calendar views, task/subtask tracking, and comment mentions.
- Rationale: Gives Finance and Governance a shared execution surface without waiting for full project-detail modules.
- Tradeoffs: Data currently persists in local JSON; database-backed collaboration will be added in Milestone B/C.

## 2026-02-10: Self-service report exports shipped as API downloads
- Decision: Deliver direct download endpoints for Excel-compatible CSV, generated PDF summary, and PowerPoint-compatible outline deck.
- Rationale: Unblocks immediate reporting workflow and supports executive distribution.
- Tradeoffs: PowerPoint export is outline-first; richer templated slide rendering can be added in a later iteration.

## 2026-02-13: Enforce workflow action gating server-side and mirror it in UI
- Decision: Introduce a shared workflow policy (`getAllowedWorkflowActions`) used by route handlers and intake UI to allow only valid transitions for current stage/status/decisions.
- Rationale: Prevents invalid manual action clicks, keeps Sponsor -> PGO/Finance -> SPO -> Funding/Live path coherent, and makes process auditable.
- Tradeoffs: Policy logic is currently code-defined (not admin-configurable yet); Milestone G will externalize transition rules.

## 2026-02-13: PowerApp-aligned intake UX and schema expansion
- Decision: Align intake with the PowerApp pattern using four tabs (`A. Overview`, `B. Sponsor & Timeline`, `C. Characteristics`, `D. Financials`) and add corresponding fields (project theme/objective/classification, sponsors, segment, fiscal matrix).
- Rationale: Keeps user familiarity high during migration and captures the same proposal metadata needed for governance and finance review.
- Tradeoffs: Data model expanded quickly using JSON persistence; relational normalization into Prisma tables is deferred to Milestone B migration.

## 2026-02-13: Financial KPIs computed from intake cash-flow model
- Decision: Compute `Payback (yrs)`, `NPV (14%)`, and `IRR` automatically from Financial tab inputs/grid and persist the computed values on draft/submit.
- Rationale: Removes manual calculation errors, matches the spreadsheet workflow, and keeps dashboard/report metrics consistent with intake data.
- Tradeoffs: Current model approximates workbook behavior in code (not direct formula execution); exact workbook parity can be tightened further once template formulas are fully catalogued.

## 2026-02-13: Financial tab tables aligned to workbook structure
- Decision: Restructure Financial tab tables to include `Life`, `Capital`, `Total Investment`, `Depreciation of Capital`, and `Net Benefits` rows with live computed values.
- Rationale: Mirrors business users' spreadsheet mental model and makes review faster for Finance/PGO.
- Tradeoffs: `Net Benefits` currently follows requested formula (`Revenue - (Saved Costs + Depreciation + Additional Operating Costs)`), which may differ from earlier savings-sign assumptions in legacy data.

## 2026-02-13: Admin-managed reference data and function rights
- Decision: Add JSON-backed admin APIs/UI for managing dropdown reference lists and per-user function rights, then consume reference data dynamically in intake forms.
- Rationale: Lets admins maintain controlled vocabularies and operational access without code changes or redeploys.
- Tradeoffs: Still local JSON persistence for now; multi-instance consistency and enterprise identity sync will be addressed during database/SSO migration.

## 2026-02-17: Approval intake summary PDF upgraded to four-section professional layout
- Decision: Use a dedicated intake-summary report formatter (`generateIntakeSummaryLines`) that outputs A/B/C/D sections, structured financial tables, and key metrics (Payback, NPV, IRR) for sponsor approval packets.
- Rationale: Approval reviewers need a single professional PDF snapshot of the full intake, not partial/tab-scoped details.
- Tradeoffs: Layout remains text-stream PDF (not full visual HTML rendering); it is highly readable and printable now, with room for later branded templated rendering.

## 2026-02-17: Native PDF table rendering for approval summaries
- Decision: Add a custom PDF drawing composer (`generateIntakeSummaryPdf`) that renders headers, section styling, and true table grids directly in PDF content streams.
- Rationale: Approval packages require formal table presentation for financials and clean print-readability.
- Tradeoffs: Manual PDF drawing code is more complex than plain text output, but avoids extra dependencies and keeps server-side generation deterministic.

## 2026-02-17: Sponsor reassignment uses portal-user dropdown with optional comment
- Decision: Replace free-text reassignment name/email with a portal-user dropdown (`/api/portal-users`) and optional comment captured with sponsor actions.
- Rationale: Prevents reassignment typo errors, enforces valid user selection, and improves sponsor handoff context.
- Tradeoffs: Sponsor decision route now relies on assignment-based authorization (assigned sponsor/admin/approver) instead of separate function-right gating for this action.

## 2026-02-17: Parallel PGO/Finance completion now promotes projects into Funding Request
- Decision: When both parallel reviews (`PGO_APPROVE` + `FINANCE_APPROVE`) are complete, auto-transition the submission to `Funding Request` with status `Approved`, and issue a targeted funding-request invitation notification to the submitter.
- Rationale: Matches requested operating model where project IDs move from Proposals into Funding Requests immediately after dual review completion, while making the next step explicit to submitters.
- Tradeoffs: This bypasses SPO Committee as the default next stage for new dual-approved items; SPO actions remain supported for existing records already in that stage.

## 2026-02-17: Finance Hub as a dedicated workspace route
- Decision: Add a dedicated `/finance` portal route and nav item that reuses operations board capabilities in a Finance-only mode (cards, tasks, comments, calendar).
- Rationale: Finance users need a focused queue without Governance noise while preserving one operational data model and API.
- Tradeoffs: Finance Hub currently shares the same underlying card/task/comment store as SPO Hub; role-specific hard authorization can be tightened in a later pass.

## 2026-02-17: Hubs organized by To Do / In Progress / Closed work buckets
- Decision: In both SPO Hub and Finance Hub Kanban views, organize cards into three columns (`To Do`, `In Progress`, `Closed`) based on task completion state per card.
- Rationale: Provides a clearer operational board view aligned with delivery tracking instead of only lane-based grouping.
- Tradeoffs: Bucket assignment is task-driven (not full workflow-status-driven), so card movement reflects work execution progress first.

## 2026-02-17: Navigation IA updated to header-home + grouped Governance hubs
- Decision: Move `Home` navigation from sidebar to header icon action, and group hub links under expandable `Governance Hubs` in left nav with renamed entries `Finance Governance Hub` and `Project Governance Hub`.
- Rationale: Reduces left-nav clutter, aligns with requested UX hierarchy, and makes governance workspaces discoverable as one section.
- Tradeoffs: Adds one extra expand/collapse interaction in sidebar; collapsed mode still exposes direct hub icons for quick access.

## 2026-02-17: Governance Hub queue eligibility restricted to governance-review stages
- Decision: Create and retain Governance Hub cards only when submission stage is `PGO & Finance Review` or `SPO Committee Review`; auto-remove stale cards for drafts and other non-governance stages.
- Rationale: Draft/proposal records should stay in Projects tables and only sponsor-approved governance work should appear in hub to-do lanes.
- Tradeoffs: Historical hub cards for completed/non-governance stages are pruned from the operational board snapshot.

## 2026-02-17: Submission ownership now enforced from authenticated session
- Decision: On draft create, submission create, and submission patch, set `ownerName`/`ownerEmail` from authenticated session (or preserve existing owner), rather than trusting client defaults.
- Rationale: Ensures `Save Draft` records stay visible in the submitter’s Projects table and remain editable for resubmission.
- Tradeoffs: Owner reassignment is no longer client-driven through intake payload; explicit reassignment should use admin/workflow paths.

## 2026-02-17: Workflow API authorization split by action type
- Decision: Allow submitters to execute owner-scoped actions (`SEND_TO_SPONSOR`, `SUBMIT_FUNDING_REQUEST`, `RAISE_CHANGE_REQUEST`) on their own records even if `run_workflow_actions` is false; keep sponsor/governance decision actions restricted to sponsor/elevated roles.
- Rationale: Submitters must be able to submit their own proposals into sponsor approval without being blocked by reviewer-level workflow rights.
- Tradeoffs: Authorization logic in workflow route is more granular and therefore slightly more complex than one global permission check.

## 2026-02-17: Governance Hub collaboration shifted from comments to task assignees
- Decision: Remove card-level comment input from Governance/Finance hub cards and introduce task-level assignee fields (name/email) with persistent assignment updates.
- Rationale: Team requested clearer operational ownership per task rather than free-text comment threads.
- Tradeoffs: Informal conversation history is no longer visible in card UI; assignment state now carries primary collaboration intent.

## 2026-02-17: Project Governance characteristics popup editor
- Decision: In Project Governance lane cards, clicking the project title opens a modal limited to Characteristics fields and saves through a dedicated endpoint (`/api/submissions/[id]/characteristics`).
- Rationale: Governance users need quick, in-context metadata corrections without navigating the full intake form.
- Tradeoffs: Characteristics editing is intentionally scoped to governance-review stages and governance roles, which adds explicit stage/role checks in backend route handlers.

## 2026-02-17: Governance task progression is gated by characteristics updates
- Decision: Block manual `Project Governance` task transition to `In Progress` until characteristics are saved through the governance modal; on successful characteristics change, auto-mark governance characteristics as updated and move the primary gating task from `To Do` to `In Progress`.
- Rationale: Aligns task execution with required governance data-quality updates and prevents premature progress movement.
- Tradeoffs: Adds a conditional workflow dependency in operations task APIs, which slightly increases board status logic complexity.

## 2026-02-17: Finance Hub read-only financial preview modal
- Decision: Add a Finance-lane project title modal that displays Financial tab content (Total Investment table, Incremental Revenue & Cost table, and Payback/NPV/IRR metrics) in read-only form.
- Rationale: Finance reviewers need fast access to intake financials directly from governance queues without editing rights.
- Tradeoffs: Financial preview is rendered in modal-specific table UI rather than reusing intake tab components, so presentation must be maintained alongside intake layout changes.

## 2026-02-17: Auto-promote submitter status to SPO review when both hub task queues complete
- Decision: When all tasks are `Done` in both Finance and Project Governance cards for the same project, auto-transition submission stage/status to `SPO Committee Review` / `At SPO Review`, set governance decisions approved, and notify the submitter.
- Rationale: Operations completion across both governance hubs should immediately reflect that the item is now at SPO review in the submitter’s Projects table.
- Tradeoffs: The SPO-review transition is now also task-completion driven (in addition to explicit workflow actions), introducing another valid pathway into SPO review.

## 2026-02-17: Governance hubs now use full month-grid calendar view
- Decision: Replace the hubs’ list-style calendar panel with a scrollable month-grid calendar (Sunday-Saturday), month navigation (`Prev`/`Next`/`Today`), and due-date deliverable chips in day cells.
- Rationale: Users need a proper calendar surface to review deadlines and deliverables over time rather than a flat sorted list.
- Tradeoffs: Calendar density is higher and uses horizontal overflow on narrow viewports to preserve readable day cells.

## 2026-02-17: SPO Committee hub tables now support full sort/filter parity
- Decision: Extend SPO Committee Hub table behavior to match project tables with column sort controls, filter-toggle rows, and clearable column filters; apply the same pattern to the Saved Versions table.
- Rationale: Users need consistent data exploration controls across governance modules without learning a different interaction model.
- Tradeoffs: Additional table state (sort/filter for current and version views) increases component complexity, but keeps UX consistent and predictable.

## 2026-02-17: Governance hubs use top-right task composer trigger per project card
- Decision: Replace always-visible task inputs with a top-right `+ Add` button on each project card in Finance and Project Governance hubs that toggles the task composer (title, due date, assignee).
- Rationale: Keeps cards cleaner while still making task creation explicit and quick for governance users.
- Tradeoffs: Adds one click before entering task details, but significantly reduces visual clutter in cards.

## 2026-02-17: Gating-task completion now promotes proposals to Funding Request + SPO queue
- Decision: When the `Conduct proposal placemat gating review` task is `Done` in both Finance and Project Governance cards, auto-transition the submission from `PGO & Finance Review` to `Funding Request` with status `At SPO Review`, and include it in SPO Committee Hub intake rows.
- Rationale: Aligns operations flow to move completed governance-gated proposals out of the Proposals table, into Funding Requests, while still routing them into SPO committee review workload.
- Tradeoffs: Transition is keyed to completion of the gating task (not all card tasks), so optional extra tasks no longer block the move.

## 2026-02-17: SPO Committee project IDs open read-only four-section preview
- Decision: Make SPO Committee table project IDs clickable to open a modal preview containing read-only `A. Overview`, `B. Sponsor & Timeline`, `C. Characteristics`, and `D. Financials` content.
- Rationale: Committee users need quick full-intake context without leaving the hub or risking accidental edits.
- Tradeoffs: Adds client-side modal/fetch state to the SPO component, but preserves strict no-edit behavior for committee review.

## 2026-02-17: SPO save action now applies approval outcome and broader committee access gate
- Decision: Allow SPO save access for users with any of `run_workflow_actions`, `sponsor_decision`, or `view_all_submissions`; when a row decision is `Approved`, persist submission workflow/status as SPO-approved (`Funding Request` + `Approved` + `spoDecision=Approved`) and surface status as `SPO Approved`.
- Rationale: Prevents unintended 403 errors for authorized committee personas and ensures Save All Changes drives real workflow state change.
- Tradeoffs: API authorization is broader than a single right, so governance of function-right assignments remains important in Admin.

## 2026-02-18: Funding Requests open as Business Case form mode
- Decision: Reuse the existing intake editor for `Funding Request` stage records, but switch labels and tab presentation to a Business Case view with sections `A. Project Overview`, `B. Resource Requirements`, `C. Financial Plan`, `D. Metrics and KPIs`.
- Rationale: Keeps one maintained form implementation while matching the required Funding Request user experience and terminology.
- Tradeoffs: Underlying payload/schema remains shared with proposal intake, so some business-case-specific fields still rely on mapped existing sections rather than a fully separate data model.

## 2026-02-18: Dashboard upgraded to unified multi-layer intelligence platform
- Decision: Replace the single blended dashboard with a modular, filter-driven platform composed of five layers: Operational, Strategic, Analytical, Tactical, and Contextual.
- Rationale: Supports different decision horizons (real-time operations through executive strategy) while reusing one consistent data model and interaction pattern.
- Tradeoffs: The current implementation uses in-app computed metrics and lightweight visualizations (no external BI/chart engine), which keeps the stack lean but limits advanced charting until a future integration phase.

## 2026-02-18: Funding Request form now uses dedicated Business Case field model
- Decision: Introduce a new persisted `businessCase` structure on submissions and render template-aligned Business Case inputs in Funding Request mode across four tabs (`A. Project Overview`, `B. Resource Requirements`, `C. Financial Plan`, `D. Metrics and KPIs`).
- Rationale: The Business Case process requires a materially richer field set than placemat intake (resource/risk/regulatory narratives, benefit realization plan, KPI grid, and opportunity rows) and must map closely to existing workbook artifacts.
- Tradeoffs: Model and form complexity increased; however, keeping the data on the existing submission record avoids a disruptive split schema during current milestone delivery.

## 2026-02-19: Project Copilot uses App Router APIs + Prisma-backed conversation memory
- Decision: Implement Copilot as a first-class portal module using Next.js App Router route handlers and Prisma models (`CopilotConversation`, `CopilotMessage`, `CopilotArtifact`, `CopilotFeedback`, `CopilotAuditLog`) with project linking.
- Rationale: This keeps AI interactions auditable, secure, and reusable inside existing workflow pages while preserving a clean API boundary for future model/provider changes.
- Tradeoffs: Introduces a parallel persistence layer (PostgreSQL for Copilot + JSON store for existing submissions), so project context is synchronized from JSON submissions into Prisma `Project` records when Copilot is used.

## 2026-02-19: LLM provider strategy is Azure OpenAI first with OpenAI fallback and local fallback mode
- Decision: Add a provider abstraction that prioritizes Azure OpenAI when configured, falls back to OpenAI when Azure is not configured, and uses deterministic local fallback text when no credentials exist.
- Rationale: Supports enterprise deployment preference (Azure), keeps local development unblocked, and avoids hard failures when credentials are unavailable.
- Tradeoffs: Feature parity is limited in fallback mode (no true model reasoning), but API contracts and UI behavior remain testable.

## 2026-02-19: Structured-output contract for artifact persistence
- Decision: For structured modes, require model responses to include JSON wrapped in explicit markers (`[[COPILOT_JSON]]...[[/COPILOT_JSON]]`) and parse/store artifacts by mode.
- Rationale: Enables reliable downstream persistence/rendering of tasks, risks, KPIs, and executive summaries.
- Tradeoffs: Relies on prompt compliance and parser robustness; malformed JSON gracefully degrades to text-only responses.

## 2026-02-19: Dynamic fiscal-year selector follows Nov-Oct fiscal calendar
- Decision: In Proposal `D. Financials`, replace the static commencement fiscal year dropdown with a dynamic 10-year window based on current fiscal year (`current` + `next 9`), where fiscal year rolls over on November 1 and ends October 31.
- Rationale: Keeps year options current without code changes and aligns selection behavior to the organization’s fiscal calendar.
- Tradeoffs: Existing records with older commencement years are preserved by injecting their saved year into the options list when it falls outside the active 10-year window.

## 2026-02-19: Business Case user experience moved to A-tab with quadrant matrix selector
- Decision: Move `User Experience` from `B. Resource Requirements` into `A. Project Overview` and replace manual impact selection with a clickable A/B/C/D CE matrix quadrant control.
- Rationale: Keeps related contextual assessment near project narrative and gives users a faster, consistent way to classify CE contribution vs CE negative impact.
- Tradeoffs: `userExperienceImpact` now primarily stores quadrant codes (`A`/`B`/`C`/`D`) rather than free-form values.

## 2026-02-19: Investment/Regulation inputs split between A and B Business Case tabs
- Decision: Move the regulation-focused inputs (`Regulatory / Governing Body`, `Specific Regulation Name (or Deficiency ID)`, `Implementation Due Date`, `Impacted Application`) into `A. Project Overview` under `Investment / Regulation and Solution (Optional)` and show this block only when `Project Classification` is one of `RG`, `RG 1`, `RG 2`, `RG 3`.
- Rationale: Keeps regulatory context with project overview while limiting the section to regulatory-classified items.
- Tradeoffs: Remaining technology-application fields were retained in `B. Resource Requirements` under a new heading (`Technology Application Resources`), splitting one prior section across two tabs.

## 2026-02-19: User Experience matrix constrained to fixed square footprint
- Decision: Constrain the CE matrix interaction area to a fixed square (`30rem x 30rem` max, responsive down) and render quadrants inside an `aspect-square` grid.
- Rationale: Prevents horizontal stretching on wide screens and keeps the matrix visually aligned to the intended 2x2 risk-impact style.
- Tradeoffs: Large fixed footprint can require more vertical space in narrower layouts, but preserves chart readability and click targets.

## 2026-02-19: User Experience impact and quadrant captured as separate fields
- Decision: Add a dedicated `User Experience Impact` dropdown (`Internal`, `External`, `Both`) above the CE matrix and store quadrant selection separately as `userExperienceQuadrant`.
- Rationale: Users need to capture audience impact independently from matrix quadrant scoring.
- Tradeoffs: Introduces backward-compatibility handling for older records where quadrants were previously stored in `userExperienceImpact`; legacy values are mapped into `userExperienceQuadrant` during normalization.

## 2026-02-19: Business Case introduction now carries fiscal anchor fields
- Decision: Add `Current Year` (editable dropdown) and `End of Fiscal in Current Year` (auto-derived) to Business Case `A. Project Overview > Introduction`, defaulting from Proposal commencement fiscal year and using fiscal year-end date `31-Oct-YYYY`.
- Rationale: Business Case sections and downstream cost tables need an explicit fiscal anchor that can default from proposal intake but still be overridden when needed.
- Tradeoffs: Adds one more synchronization path between Proposal financial grid and Business Case introduction, requiring guarded auto-sync logic to avoid overwriting user edits.

## 2026-02-19: Human Resource cost columns are computed client-side by fiscal bucket
- Decision: Add 11 read-only, dynamic cost columns to Business Case Human Resources with headers keyed to Introduction `Current Year` (`FYYYY Q1-Q4`, `FYYYY...FYYYY+5`, and overall total), computed from pay-grade monthly salary, allocation, and resource start/end dates.
- Rationale: This matches workbook-style financial planning expectations without requiring users to manually key repetitive time-phased resource costs.
- Tradeoffs: Calculations are performed in the client (daily prorated model), so displayed values are derived and not separately persisted as editable inputs.

## 2026-02-20: Business Case Financial Plan adds workbook-style P&L Impact table
- Decision: Add a new persisted `pAndLImpact` table model to Business Case data and render a `P & L Impact` grid in `C. Financial Plan` with grouped rows, dynamic fiscal headers, yellow editable cells, and auto-calculated total rows (`Total Revenue`, `Total Saved Costs`, `Total Additional Operating Costs`, `Total Expenses`, `NIBT`).
- Rationale: Aligns the portal's Financial Plan structure to the reference workbook layout and reduces manual calculation errors for summary rows.

## 2026-02-21: Reports Studio implemented as a governed self-service reporting framework
- Decision: Add a dedicated reporting domain (`lib/reporting/*`) with approved dataset registry, report/template definition stores, server-side run engine, deterministic insights, and new `/api/reporting/*` endpoints consumed by a multi-page `/reports` studio UI.
- Rationale: Users need non-technical self-service table/chart building with reusable templates, sharing/versioning, and analytics while preserving strict data governance and RBAC.
- Tradeoffs: Storage currently uses JSON-backed stores for speed and consistency with existing portal modules; relational persistence can be migrated later without changing API contracts.

## 2026-02-21: Export stack uses dependency-free fallback artifacts pending package-network availability
- Decision: Implement reporting exports with server-side generated Excel-compatible workbook XML (`.xls`), CSV raw extracts, and branded PowerPoint outline payload (`.ppt`) under the required reporting export APIs.
- Rationale: Network restrictions prevented installing `exceljs` and `pptxgenjs` (`ENOTFOUND registry.npmjs.org`), but users still need immediate structured export capability from Reports Studio.
- Tradeoffs: Current exports are compatibility-focused rather than full native XLSX/PPTX binaries; endpoints and service boundaries are ready for direct library upgrade once package install is available.

## 2026-02-21: Workflow lifecycle engine consolidated around proposal/funding statuses
- Decision: Move workflow control to a centralized lifecycle model (`PROPOSAL` and `FUNDING_REQUEST` entity types with explicit lifecycle enums), and enforce state transitions server-side through shared workflow/reconciliation services.
- Rationale: Prevents client-side status spoofing, keeps stage/status behavior consistent across APIs/UI, and supports deterministic automations (approval request fan-out, governance task gating, SPO-to-funding transfer, FR lock-on-approval).
- Tradeoffs: Transitional complexity increased because legacy stage/status records must be normalized into lifecycle state on read/write.

## 2026-02-21: Approval queue migrated to request-level entity with notification provider abstraction
- Decision: Implement `ApprovalRequest` as a first-class persisted record with role-context (`BUSINESS_SPONSOR`, `BUSINESS_DELEGATE`, `FINANCE_SPONSOR`, `TECH_SPONSOR`, `BENEFITS_SPONSOR`) and route user approvals by request ID, while introducing a notification provider abstraction that emits in-app + Outlook/Teams placeholder messages.
- Rationale: Enables auditable, project-scoped sponsor approvals (including sponsor/delegate OR behavior for Business stage) and makes outbound channels swappable for future Microsoft 365 integration.
- Tradeoffs: During interim JSON persistence, approval history consistency depends on store-level reconciliation rather than transactional database guarantees.

## 2026-02-21: PM Hub analytics served from additive server-side executive dashboard module
- Decision: Add a dedicated PM analytics service (`lib/pm-dashboard/analytics.ts`) and `/api/pm-dashboard/*` endpoints with strict server-side RBAC filtering, then render a new tabbed executive PM dashboard above the existing PM operations section.
- Rationale: Delivers portfolio + drilldown decision support (SLA, schedule, risks, resources, benefits) without removing existing PM assignment/task-board workflows.
- Tradeoffs: Current PM analytics uses deterministic synthesized milestone/task/risk/issue/SLA-event extensions (with optional `data/pm-dashboard.json` overrides) instead of fully normalized relational tables; this keeps delivery fast while preserving an upgrade path to Prisma-backed PM domain tables.

## 2026-02-20: Two-layer governance audit model (submission timeline + centralized audit stream)
- Decision: Implement immutable per-submission `auditTrail` entries on create/update/workflow transitions and add a centralized governance audit log (`data/governance-audit-log.json`) for key admin/workflow/SPO actions, with a secured admin API/view.
- Rationale: QA and governance controls require both record-level traceability (how a single submission moved) and cross-system oversight (who changed configuration/rights/workflow state globally).
- Tradeoffs: JSON-backed logging is suitable for current single-instance delivery but not tamper-evident or multi-instance resilient; migration to database append-only audit tables is planned in Milestone B/H hardening.
- Tradeoffs: The table adds form complexity and client-side calculation logic, and requires strict row-ID normalization to preserve compatibility with previously saved Business Case drafts.

## 2026-02-21: Centralized RBAC + project-scoped sponsor approvals replace checkbox permissions
- Decision: Replace per-user checkbox/function-right authorization as the primary access model with centralized RBAC policies (`lib/auth/rbac.ts`) and enforce project visibility/edit/approval decisions server-side through shared guards (`canAccessModule`, `projectVisibilityScope`, `canViewProject`, `canEditProject`, `canApproveProject`).
- Rationale: A single authoritative policy layer prevents drift between UI and API behavior, supports least-privilege role governance, and satisfies QA requirements for deterministic access control.
- Tradeoffs: Some legacy compatibility adapters remain during migration (for existing APIs/UI payloads), increasing short-term code paths until full persistence migration to Prisma-backed runtime services is completed.

## 2026-02-21: Sponsor and delegate entitlements are dynamic, project-scoped approvals (not roles)
- Decision: Model sponsor/delegate authority as project-scoped entitlements derived from sponsor fields, allowing view + approve on designated projects and capturing `actingAs` (`SPONSOR`/`DELEGATE`) per approval action.
- Rationale: Sponsor responsibilities are assignment-based and must not grant broad edit/admin privileges; this keeps governance approvals auditable without over-privileging users.
- Tradeoffs: Approval eligibility checks now depend on both stage status and sponsor assignment state, which adds extra normalization/validation steps when sponsor assignments change.

## 2026-02-21: PM Admin-only reassignment flow for project manager ownership
- Decision: Enable project manager reassignment from the Project Management Dashboard by allowing `ownerName`/`ownerEmail` updates in `PATCH /api/submissions/[id]` only for `PROJECT_MANAGEMENT_HUB_ADMIN` and `ADMIN`.
- Rationale: PM operations need controlled reassignment from one dashboard surface while preserving non-admin edit boundaries and server-side authorization guarantees.
- Tradeoffs: Submission patch handling now includes role-gated owner-field branching, adding minor conditional complexity in the update route.

## 2026-02-21: Approved-project updates now route exclusively through Change Requests
- Decision: Lock direct API edits for approved/live delivery submissions and implement a first-class Change Management domain (`lib/change-management/*`) with explicit Change Request statuses, impact/severity scoring, before/after field-delta persistence, review approvals, implementation controls, and immutable audit logging.
- Rationale: Enterprise change control requires auditable, approval-gated modifications rather than direct field edits on approved records.
- Tradeoffs: Workflow complexity increased (new lifecycle and approval resolution paths), but enforcement is centralized server-side and aligned with governance controls.
