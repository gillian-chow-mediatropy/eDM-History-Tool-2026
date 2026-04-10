# Project Detail and Delivery Plan

Last updated: April 10, 2026 (Asia/Jakarta)

## 1) What We Want To Build

Build an end-to-end Marriott email campaign workflow platform that covers:
- Step 0: source campaign/template selection from archive
- Step 1: campaign draft creation from approved templates
- Step 2: drag-drop content builder with guardrails and versioning
- Step 3: proof sending and revision iterations
- Step 4: finalization and lock
- Step 5: automatic final approval notification to Mediatropy
- Step 6: Adobe Web UI handoff confirmation and campaign closure

Primary goals:
- Remove manual DB editing from daily operations.
- Standardize template governance (Template 1-6).
- Improve auditability, reliability, and handoff traceability.

## 2) What Is Already Built

Platform foundation:
- React + Express + Prisma architecture migration completed.
- Auth/session and role-permission protection completed.
- Admin shell and branded UI completed.

Admin and master data:
- Users module with create/edit/role/password workflows.
- Areas and Markets modules (including Additional Markets split).
- Source Campaign Master module in dedicated admin page.
- Template master module for fixed Template 1-6.
- Archive-to-master seeding pipeline completed.

Archive and preview:
- Archive filtering and preview parity completed.
- Broken preview detection and fallback handling completed.

Campaign and builder:
- Campaign list/create/edit/manage flow completed.
- Step 1 template binding to campaign implemented.
- Step 2 builder foundation implemented (JSON model, drag-drop, locked header/footer, QA checks, personalization tokens, autosave, version compare/restore, desktop/mobile preview).
- Proof send API route and builder send action already present.

Recent updates completed:
- Template page now groups by `Template + Language` (not only Template 1-6).
- Language column removed from Template page.
- Working links prioritized over broken links in template selection.
- `Extract Status` column added (`Ready` vs `Cannot extract the template`).
- For `Cannot extract the template`, preview is hidden and `Import HTML` is disabled.
- Campaign create/edit template dropdown updated to language-aware labels.

## 3) Current Workflow Status

| Step | Name | Status |
|---|---|---|
| 0 | Source campaign/template selection | Done |
| 1 | Campaign draft creation from template | Done |
| 2 | Drag-drop builder + versioning + QA | In progress (UAT sign-off/polish remaining) |
| 3 | Proof loop and iteration management | Todo |
| 4 | Mark final and lock | Todo |
| 5 | Final approval notification to Mediatropy | Todo |
| 6 | Adobe handoff completion and closure | Todo |

Reference: `api/data/progress.json` (dataVersion `35`, lastUpdated `2026-04-09`).

## 4) In Progress and Not Done Yet

In progress now:
- Step 2 final market UAT sign-off and polish pass.
- Step 2 media management track (server storage first): Media menu/library foundation and DB-backed media persistence APIs are implemented; multi-upload/bulk delete and Builder picker integration are next.

Not done yet:
- Step 3 full proof lifecycle alignment with tracked iteration workflow.
- Step 4 finalization lock and immutable snapshot flow.
- Step 5 auto-notification with retry and delivery logs.
- Step 6 operational handoff checklist and closure status.

## 5) Known Gaps / Potential Bugs / Risk Items

Known gaps:
- Language detection can still show `Unknown` when both archive language metadata and template HTML `lang` are missing.
- Workflow tracker (`progress.json`) and some implemented proof features should be reconciled so status reflects actual code behavior.

Technical risks:
- Frontend bundle size warning (`vite` chunk > 500 KB). Not blocking, but should be optimized before production hardening.
- External dependency risk on Smartsheet and remote preview URL stability.

Operational risks:
- Data quality of source campaign metadata (language/requestId consistency) directly affects template-language precision.
- Step 3 to Step 6 process definitions need strict acceptance criteria before UAT.

## 6) What To Prioritize Next

P0 (highest):
- Complete Step 3 to Step 4 core workflow contract and persistence model.
- Add finalization lock guarantees and audit timeline coverage.
- Add Step 2 Media module and wire image selection (`Choose from Media` / `Upload new`) in Builder image forms.

P1:
- Implement Step 5 notification trigger, retries, and status visibility.
- Implement Step 6 handoff checklist and closure confirmation.

P2:
- Language metadata quality improvement (reduce `Unknown` further).
- Frontend chunk optimization and performance cleanup.

## 7) Delivery Plan

From current timeline:
- April 9 to April 17, 2026: platform build completion.
- April 20 to April 24, 2026: external UAT round 1.
- April 27 to April 30, 2026: fix/refinement round 1.
- May 4 to May 8, 2026: external UAT round 2.
- May 11 to May 15, 2026: fix/refinement round 2.
- May 18 to May 22, 2026: final review and approval.
- May 25, 2026: launch (password protected).

Suggested execution order for next sprint:
- Finalize Step 3 persistence and UI behavior.
- Implement Step 4 lock and final snapshot.
- Wire Step 5 notification pipeline.
- Implement Step 6 closure workflow.
- Close with regression test pass and UAT checklist update.

## 8) Definition of Done for Remaining Major Scope

Step 3 done when:
- Proof recipients, iteration counting, resend, and proof history are complete and auditable.

Step 4 done when:
- Final action creates immutable snapshot and blocks non-authorized edits.

Step 5 done when:
- Mediatropy notification sends automatically, retries on failure, and logs delivery state.

Step 6 done when:
- Handoff metadata is stored, completion is confirmed, and campaign status closes with timestamp.

## 9) Documentation Maintenance Rules

- Keep this file updated when workflow status changes.
- Keep `README.md` focused on setup/operation.
- Keep `api/data/progress.json` as the source for phase milestone tracking.
