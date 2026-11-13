# SDMS Print Studio — Phased Delivery Backlog

**Version:** 1.0 | **Date:** 2026-11-09 | **Status:** In progress  
**Related:** `PLAN.md`, `DEVELOPER_GUIDE.md`

## How to use this backlog

- Tasks are ordered by phase and dependency. Complete the **vertical slice** before building advanced Canva-style features.
- Check a box only after implementation, tests, documentation, and associated acceptance criteria pass.
- **P0:** blocks product correctness/security; **P1:** needed for strong MVP; **P2:** enhancement; **P3:** later business integration.
- Tags: `[UI]`, `[DATA]`, `[CANVAS]`, `[PRINT]`, `[TEST]`, `[OPS]`, `[SEC]`.
- Effort is estimated in solo-developer **ideal days**, ranges are not delivery promises; technical unknowns can change them.
- Dependencies are task IDs; no checkmarks mean work is not yet completed.

The local Quick Print build covers the upload, crop, quantity, preview, and PDF workflow. It now includes 32 photo-size presets and independent size, crop, copies, and frame orientation per entry. The browser checks exported 16 same-size prints across two A4 sheets (15 + 1), and a mixed sheet with four 2×2, eight 1×1, and one 3R print. Physical printer calibration and the wider release test matrix are pending.

## Milestones and release gates

| Milestone | Outcome | Required gate |
| --- | --- | --- |
| M0 — Foundation | Working app + typed model + geometry tests | CI and build succeed |
| M1 — Print core | Accurate 1×1 / 2×2 A4 PDF using original photo | PDF readback + physical calibration |
| M2 — Quick Print | Upload → crop → quantity → paginate → export | Browser E2E flow |
| M3 — Basic canvas editor | Select/move/resize/rotate, property edit and history | No preview/export geometry drift |
| M4 — Local projects and launch | Save/load, preflight, accessible UI, stable downloads | Privacy, accessibility, regression |
| M5 — Advanced Designer | Text, vector elements, layers, template builder | Feature parity tests + font tests |
| M6 — Shop integration | Orders, quotes, cloud persistence (optional) | Auth, tenancy, retention, data protections |

## Phase 0 — Project foundation (M0)

### Epic FND — Developer environment

- [ ] **FND-001 [P0][OPS] Initialize repository** (0.5d). Create a clean Next.js App Router app using TypeScript, Tailwind v4, ESLint, `src/` and `@/` alias. **AC:** `pnpm dev`, `pnpm build`, lint and typecheck succeed on Windows and CI. **Depends:** —
- [ ] **FND-002 [P0][OPS] Configure dependency baseline** (0.5d). Install shadcn/ui, Konva/react-konva compatible with the React major version, Zustand, pdf-lib, Zod, `idb`, testing tools. Lock versions. **AC:** no peer-dependency errors; lockfile checked in. **Depends:** FND-001
- [ ] **FND-003 [P0][OPS] Configure quality scripts** (0.5d). `typecheck`, `lint`, `test`, `test:e2e`, `build`. Prettier optional. **AC:** each command passes on a clean checkout. **Depends:** FND-001
- [ ] **FND-004 [P1][OPS] CI pipeline** (0.5d). GitHub Actions (or equivalent) for install, typecheck, unit tests and build. **AC:** failing tests block merge. **Depends:** FND-003
- [ ] **FND-005 [P1][UI] UI primitives and theme** (1d). Add shadcn button, dialog, tabs, input, slider, dropdown, tooltip, select, sheet, progress, toast, keyboard/focus styles. Define shared Studio theme tokens from the [SDMS Digital visual theme](./PLAN.md#61-sdms-digital-visual-theme). **AC:** the demo page reflects SDMS typography, colors, and control styling in light mode, supports dark mode, and has visible keyboard focus and accessible labels. **Depends:** FND-002
- [ ] **FND-006 [P1][OPS] Document conventions** (0.5d). Unit standards, folder structure, naming, error codes and PR checklist. **AC:** new contributors know the canonical document model and version policy. **Depends:** FND-002

### Epic DOM — Geometry/document model

- [ ] **DOM-001 [P0][DATA] Define `PrintDocument` and `PrintElement` types** (1d). Use discriminated unions, mm top-left origin, asset IDs, sheet sizes, locked/hidden flags. **AC:** examples typecheck without `any`. **Depends:** FND-001
- [ ] **DOM-002 [P0][DATA] Add Zod schemas and schemaVersion** (1d). Validate imported JSON, finite numbers, valid rotations, asset IDs, page limits. **AC:** malformed/oversized input is rejected with typed error; unknown future versions not silently parsed. **Depends:** DOM-001
- [ ] **DOM-003 [P0][PRINT] Unit conversion module** (0.5d). mm↔in, mm↔points, top-left↔PDF bottom-left. **AC:** 25.4 mm exactly maps to 72 pt within tolerance; geometry tests pass. **Depends:** DOM-001
- [ ] **DOM-004 [P0][DATA] Template catalog schema** (1d). Stable IDs/versions, categories, name, photo dimensions, page, default margin/gap. **AC:** templates are data, not hard-coded UI branches; 1×1/2×2/35×45/3R/4R templates validate. **Depends:** DOM-002
- [ ] **DOM-005 [P1][DATA] Document migrations** (1d). Add explicit migration interface and fixture strategy. **AC:** v1 files reopen after a v2 schema test migration; unsupported future version yields clear message. **Depends:** DOM-002

### Epic TST — Test scaffolding

- [ ] **TST-001 [P0][TEST] Unit test runner/fixtures** (0.5d). Vitest examples for unit conversions, template schema. **AC:** deterministic test command passes headless. **Depends:** FND-003, DOM-003
- [ ] **TST-002 [P1][TEST] Playwright setup** (0.5d). Smoke test for template gallery. **AC:** Chromium E2E in CI, additional Firefox/WebKit locally or CI matrix. **Depends:** FND-003

**M0 gate:** FND-001–003, DOM-001–004, TST-001 complete; build reproducible.

---

## Phase 1 — Print engine: smallest reliable vertical slice (M1)

### Epic AST — Source image ingestion

- [ ] **AST-001 [P0][SEC] File input validation** (1d). Accept supported JPEG/PNG, inspect content, size/pixel limits, count limit; safe errors. **AC:** spoofed or unsupported files do not crash editor. **Depends:** DOM-001
- [ ] **AST-002 [P0][DATA] Decode/orientation normalization** (1–2d). Read intrinsic dimensions, orient once using tested browser path, create stable source metadata. **AC:** portrait photos with EXIF orientations look upright after preview and PDF export. **Depends:** AST-001
- [ ] **AST-003 [P0][DATA] Asset repository interface** (1d). `getBytes`, `getMetadata`, `put`, `remove`, `list`, in-memory implementation first. **AC:** document JSON contains IDs, not data URLs. **Depends:** AST-001, DOM-001
- [ ] **AST-004 [P1][DATA] Thumbnail generation** (0.5–1d). Independent low-resolution preview, release object URLs. **AC:** browser remains responsive for 10 reasonable-size images. **Depends:** AST-002, AST-003

### Epic LAY — Uniform photo layout

- [x] **LAY-001 [P0][PRINT] Grid capacity and placements** (1d). Compute cols/rows given sheet/photo/margin/gap; reject no-fit. **AC:** on A4, 2×2 in, 5 mm margin and 3 mm gap returns 3×5 capacity 15. **Depends:** DOM-003, DOM-004
- [x] **LAY-002 [P0][PRINT] Copies and pagination** (1d). Stable ordered expansion of quantity per asset, generate multiple pages. **AC:** 16 copies create 2 A4 pages using preceding preset; all IDs accounted for once. **Depends:** LAY-001
- [ ] **LAY-003 [P1][PRINT] Orientation and paper settings** (0.5d). A4/Letter/Legal/4R and portrait/landscape, min/max margins. **AC:** changing orientation recomputes layout, never rescales photo dimensions. **Depends:** LAY-001
- [ ] **LAY-004 [P1][PRINT] Deterministic golden fixtures** (0.5d). Snapshot placed mm rectangles and page order. **AC:** same input and parameters give identical output. **Depends:** LAY-002
- [x] **LAY-005 [P1][PRINT] Fit all prints to one sheet**. Add an explicit option to proportionally reduce uniform and mixed jobs onto one sheet. **AC:** copies, crops, aspect ratios, margins, and gaps are preserved; reduced printed dimensions are visible; disabling restores the selected sizes; impossible gaps or margins block export. **Depends:** LAY-002, ADV-010

### Epic EXP — PDF generation

- [x] **EXP-001 [P0][PRINT] PDF page factory** (0.5–1d). Create exact MediaBox sizes in points. **AC:** readback with pdf-lib matches A4 and 4R geometry within 0.1 mm. **Depends:** DOM-003
- [x] **EXP-002 [P0][PRINT] Original-resolution image placement** (1–2d). Embed JPEG/PNG; correctly map top-left geometry; cache repeat images. **AC:** 2×2 output measures 50.8 mm and never uses a stage screenshot as source. **Depends:** EXP-001, AST-003, LAY-002
- [x] **EXP-003 [P0][PRINT] Source-pixel crop renderer** (2d). Clip the full-resolution source to the PDF frame using source-pixel coordinates. **AC:** selected crop matches preview; no stretching; clip stays inside frame. **Depends:** AST-002, EXP-002
- [x] **EXP-004 [P1][PRINT] PDF download API (client)** (0.5d). Blob URL, sanitized filename, progress/errors, URL cleanup. **AC:** downloads a valid local PDF without a server. **Depends:** EXP-002
- [ ] **EXP-005 [P1][PRINT] Optional cut marks** (1d). Place thin vector cut lines inside supported paper area; opt-in UI. **AC:** no cut marks outside MediaBox; no unintended photo overlap. **Depends:** EXP-001
- [ ] **EXP-006 [P0][PRINT] Resolution preflight** (1d). Calculate effective DPI after crop and target size; warn below 300 and strongly below 150. **AC:** low-resolution fixtures produce expected warnings; no claim that upsampling fixes DPI. **Depends:** AST-002, DOM-001
- [ ] **EXP-007 [P0][TEST] PDF export test matrix** (1–2d). Read pages back, assert page count, sizes, appearance with visual snapshots where feasible. **AC:** A4/Letter/4R + 1×1/2×2 + multipage + landscape pass. **Depends:** EXP-002–006
- [ ] **EXP-008 [P0][TEST] Physical printer calibration** (1–2d). Print reference ruler and ID squares on representative office printers at 100%. **AC:** measured tolerances documented, steps reproduce, unexpected fit-to-page diagnosed. **Depends:** EXP-007

**M1 gate:** AST-001–003, LAY-001–002, EXP-001–003, 006–008. Do not proceed with complex design features if real print sizing fails.

---

## Phase 2 — Quick Print product (M2)

### Epic QCK — Wizard and template selection

- [ ] **QCK-001 [P0][UI] Template gallery** (1d). Search/filter cards by family, physical size preview, favorites later. **AC:** presets open correct paper/photo dimensions. **Depends:** DOM-004, FND-005
- [ ] **QCK-002 [P0][UI] Multi-image uploader** (1d). Drag/drop, multi-file picker, image queue, remove/reorder. **AC:** a bad file leaves valid files intact with clear diagnostics. **Depends:** AST-001–004
- [ ] **QCK-003 [P0][UI] Crop dialog** (1–2d). Aspect ratio lock to template, zoom/pan, numeric preview and reset. **AC:** crop references original image pixels, not thumbnail coordinates. **Depends:** AST-002, EXP-003
- [ ] **QCK-004 [P0][UI] Quantity configuration** (0.5–1d). Copies per photo, totals, ordering preference (`grouped` first). **AC:** 6+3+3 = exactly 12 placed images. **Depends:** LAY-002, QCK-002
- [ ] **QCK-005 [P0][UI] Paper and layout controls** (1d). Size/orientation, margins and gaps in mm, cut marks toggle. **AC:** impossible layout returns warning before export. **Depends:** LAY-003, EXP-005
- [ ] **QCK-006 [P0][UI] Multi-page print preview** (1–2d). Show every sheet, actual page number and warnings. **AC:** preview rectangles match exported PDF geometry. **Depends:** LAY-002, EXP-002
- [ ] **QCK-007 [P0][UI] Export dialog** (1d). PDF filename, print instructions, DPI warnings, download. **AC:** successful download with accurate page count and no blocking console errors. **Depends:** EXP-004, EXP-006
- [ ] **QCK-008 [P1][UI] Preset quick actions** (0.5d). Recent paper/settings, copy count buttons, reset. **AC:** changes are reversible and do not silently change units. **Depends:** QCK-005
- [ ] **QCK-009 [P0][TEST] End-to-end Quick Print happy path** (1d). Upload two fixtures, adjust copies, crop, export, read back PDF. **AC:** resulting total item count and page dimensions match inputs. **Depends:** QCK-001–007
- [x] **QCK-010 [P1][UI][PRINT] Brightness and contrast**. Add independent controls per print entry with live preview, Show original, Reset, Cancel, and Apply edits. **AC:** preview, crop view, and PDF carry the same adjustments; originals remain available; edited PDF images retain their source pixel dimensions; repeated copies reuse the matching edited variant. **Depends:** EXP-002, EXP-003
- [x] **QCK-011 [P1][DATA][UI] Quick Print undo/redo**. Fifty metadata-only history steps; uploads, packages, crop/edit Apply, remove, reorder and sheet settings are reversible. Numeric typing groups until blur. Ctrl/⌘ Z, Ctrl Y and Ctrl/⌘ Shift Z respect text fields and dialogs. Original assets remain available while referenced by history. Advanced canvas gestures remain under EDT-008.
- [x] **QCK-012 [P1][UI][DATA] One-click ID packages**. Mixed 4×2×2 + 8×1×1, six 2×2 and fifteen 1×1; select a source photo, replace its print entries atomically at exact sizes, and save custom ID size/quantity combinations without photos. Custom packages persist across jobs and can be deleted after confirmation; existing print layouts remain intact and deleted names can be reused.

**M2 gate:** QCK-001–007 and QCK-009 complete. Demo at a counter using actual sample pictures.

---

## Phase 3 — Canva-style editing core (M3)

### Epic EDT — Canvas interactions

- [ ] **EDT-001 [P0][CANVAS] Client-only EditorShell** (1d). Dynamically load React Konva inside client component. **AC:** Next build works without `window is not defined`; no hydration errors. **Depends:** FND-002, DOM-001
- [ ] **EDT-002 [P0][CANVAS] Page-to-pixel adapter** (1d). Render exact-mm model through `previewPxPerMm` and zoom. **AC:** zoom changes only display scale; source document JSON unchanged. **Depends:** EDT-001, DOM-003
- [ ] **EDT-003 [P0][CANVAS] Select/drag** (1d). Set selection, drag items, update model on gesture end. **AC:** pointer changes only intended mm positions; keyboard inspector shows same values. **Depends:** EDT-002
- [ ] **EDT-004 [P0][CANVAS] Transform handles** (1–2d). React Konva Transformer with scale normalized to width/height on commit. **AC:** repeated resizes have no scale drift. **Depends:** EDT-003
- [ ] **EDT-005 [P0][CANVAS] Rotation, flip and image frame** (1–2d). Preserve dimensions/crop and PDF parity. **AC:** rotated/centered preview matches export; warnings for clipped shapes. **Depends:** EDT-004, EXP-003
- [ ] **EDT-006 [P0][UI] Properties inspector** (1d). Numeric x/y/width/height/rotation, lock aspect ratio. **AC:** can edit selected object without dragging. **Depends:** EDT-004
- [ ] **EDT-007 [P0][DATA] Editor commands & transactions** (1–2d). Atomic updates, validations, IDs, transactions for drag. **AC:** all edits affect canonical document, not only Konva runtime node. **Depends:** DOM-001, EDT-003
- [ ] **EDT-008 [P0][DATA] Undo/redo** (1–2d). Snapshot/patch history excluding image bytes; limit depth. **AC:** every committed gesture undoes in one step; redo invalidates after new edit. **Depends:** EDT-007
- [ ] **EDT-009 [P1][UI] Page navigator and zoom** (1d). Add/duplicate/remove page, fit, zoom 25–400%, active page. **AC:** PDF page count/order matches editor. **Depends:** EDT-002, EDT-007
- [ ] **EDT-010 [P1][UI] Editor keyboard shortcuts** (1d). Delete, duplicate, undo/redo, arrows, escape; don't hijack text fields. **AC:** fully documented and tested for focused editor. **Depends:** EDT-008
- [ ] **EDT-011 [P1][CANVAS] Snap, guides, align, distribute** (2–3d). Optional snapping to page center, edge, object bounds, configurable guides. **AC:** guides never alter print measurements unexpectedly; shift modifiers work. **Depends:** EDT-003
- [ ] **EDT-012 [P0][TEST] Edit/export fidelity** (1–2d). Golden geometry assertions after move/resize/rotate; verify saved PDF. **AC:** edit→export→readback doesn't change physical size. **Depends:** EDT-004, EDT-005, EXP-007

**M3 gate:** EDT-001–009, 012; keyboard support recommended before public release.

---

## Phase 4 — Local save, preflight, polish, public MVP (M4)

### Epic PER — Persistence

- [x] **PER-001 [P0][DATA] IndexedDB schema**. Versioned Quick Print jobs, original asset blobs, thumbnails, active-project preference and reusable ID packages. Reload restores the last saved job and original pixels. See `STUDIO_STORAGE.md`. Advanced canvas data will extend this schema.
- [x] **PER-002 [P0][DATA] Autosave and conflict handling**. Debounced, serialized atomic saves; saved/unsaved/error status; revision conflicts prevent stale-tab overwrites; quota failures retain the current workspace. New, Projects, Save and Save copy are available. Unit tests cover round trips, conflicts and failed-save rollback; browser checks cover reload, project switching, copies and export.
- [ ] **PER-003 [P0][DATA] Portable project import/export** (1–2d). Manifest JSON plus original assets in `.sdms.zip`; guard path traversal and unsafe files. **AC:** zip exported on computer A imports on B with no broken images. **Depends:** PER-001, DOM-005
- [ ] **PER-004 [P1][DATA] Local storage management UI** (0.5d). Delete project and orphan assets, show project sizes. **AC:** delete requires confirmation and releases binary assets. **Depends:** PER-001

### Epic QLT — Preflight and product quality

- [ ] **QLT-001 [P0][PRINT] Preflight rules engine** (1–2d). Missing asset, non-finite geometry, out-of-page, low DPI, unsupported font/effect. **AC:** returns structured severity/code, linked page/element and actionable message. **Depends:** EXP-006, EDT-005
- [ ] **QLT-002 [P0][UI] Preflight UI** (1d). Warnings dialog, links to problem elements, acknowledge bypass for nonfatal warnings. **AC:** export blocked only on truly invalid content; user can fix issues. **Depends:** QLT-001
- [ ] **QLT-003 [P0][SEC] Local-data privacy and retention** (0.5d). Privacy copy, clear-local-files action, no image telemetry. **AC:** no network request contains image pixels during local flow. **Depends:** PER-001
- [ ] **QLT-004 [P1][TEST] Cross-browser and mobile smoke tests** (1–2d). Chromium, Firefox, WebKit; touch pan/crop; offline behavior. **AC:** basic workflow runs on supported browsers, known limitations documented. **Depends:** QCK-009, EDT-012
- [ ] **QLT-005 [P1][UI] Accessibility pass** (1–2d). Keyboard/focus/labels, numeric inspectors, contrast and error reporting. **AC:** key workflows navigable without relying only on canvas pointer. **Depends:** FND-005, EDT-006
- [ ] **QLT-006 [P0][OPS] Production deployment** (1d). App host + domain, CSP/CORS policy, error page, no secrets in client bundle. **AC:** build runs on production URL and all supported export flows work. **Depends:** QLT-001–004
- [ ] **QLT-007 [P0][TEST] Regression and release checklist** (1d). Geometry goldens, browser E2E, printer calibration, privacy review. **AC:** all M0–M4 release gates signed off. **Depends:** QLT-006

**M4 public MVP gate:** M0–M3 complete, PER-001–003, QLT-001–003, 006–007, no P0 release blockers.

---

## Phase 5 — Advanced Designer: text, shapes, template builder (M5)

### Epic ADV — More Canva-like features

- [ ] **ADV-001 [P1][CANVAS] Vector shape tools** (1–2d). Rectangles, ellipses, lines, color/opacity/strokes. **AC:** preview/export maintain vector geometry. **Depends:** EDT-004
- [ ] **ADV-002 [P1][CANVAS] Text tool** (2–4d). Add/edit text, fonts, sizes, alignment, wrapping, bounding box. **AC:** text can be edited through keyboard and prints predictably. **Depends:** EDT-006
- [ ] **ADV-003 [P1][PRINT] Font embedding** (2–3d). `@pdf-lib/fontkit` font loading/licensing, non-ASCII characters, text metrics. **AC:** supported custom fonts render in PDF on a clean machine; no missing glyphs in golden fixtures. **Depends:** ADV-002
- [ ] **ADV-004 [P1][UI] Layer list** (1–2d). Reorder, lock, hide, duplicate, rename. **AC:** visual stacking and PDF z-order match. **Depends:** EDT-007
- [ ] **ADV-005 [P1][CANVAS] Multi-select and group** (2–3d). Group/ungroup transforms, selection marquee. **AC:** groups preserve individual geometry through export and reload. **Depends:** ADV-004
- [ ] **ADV-006 [P1][UI] Template builder** (2–4d). Save project as editable template, expose size/margin/photo-frame slots, version. **AC:** template reapplication does not copy user photos or orphan assets. **Depends:** DOM-004, PER-003, ADV-004
- [ ] **ADV-007 [P1][UI] Custom paper & rulers** (1–2d). Measured canvas, page guides, 1 mm numeric precision. **AC:** custom paper round-trips through PDF and project. **Depends:** EDT-002
- [ ] **ADV-008 [P2][CANVAS] Additional photo effects** (2–4d). Grayscale and image rotate/flip with export parity. Brightness and contrast shipped early under QCK-010. **AC:** documented raster fallback remains high-resolution. **Depends:** EXP-003
- [ ] **ADV-009 [P2][UI] Sticker and photobooth presets** (2d). Circle/rectangle stickers, label sheets, photo strips, collage. **AC:** layouts fit page and reproduce exports. **Depends:** ADV-001, ADV-006
- [x] **ADV-010 [P2][PRINT] Mixed-size rectangle packing** (2–4d). Deterministic multi-size jobs and user-selected frame orientation. Implemented early for mixed Quick Print jobs. **AC:** never overlaps items or shrinks dimensions silently; unfinished items paginate. **Depends:** LAY-002
- [ ] **ADV-011 [P1][TEST] Advanced regression suite** (2d). Font/vector/crop/history/template golden PDF tests. **AC:** each newly supported element has preview/export and save/reload coverage. **Depends:** ADV-001–010 as implemented

**M5 gate:** ADV-001–007 and ADV-011 pass; optional P2 tasks can ship separately.

---

## Phase 6 — Printing business integration (M6, optional)

- [ ] **BIZ-001 [P3][SEC] Authentication, roles and tenancy**. Staff/admin/customer permissions; ownership checks on every API call.
- [ ] **BIZ-002 [P3][DATA] Cloud templates and projects**. Database entities, schema versions, signed image uploads, asset ownership.
- [ ] **BIZ-003 [P3][DATA] Storage lifecycle**. Consent, retention, per-customer deletion, orphan cleanup, encryption, audit trail.
- [ ] **BIZ-004 [P3][UI] Order and quote flow**. Product, sheets, copies, color/BW, paper stock, unit price, proof approval.
- [ ] **BIZ-005 [P3][PRINT] Print-job queue**. Staff review, export status, job history, reprint handling.
- [ ] **BIZ-006 [P3][SEC] Checkout/payment integrations**. Payment provider webhook verification, idempotency, refunds.
- [ ] **BIZ-007 [P3][OPS] Background export workers**. Large documents, retries, quotas, cancellation, user notification.
- [ ] **BIZ-008 [P3][TEST] Security and data protection**. Tenant isolation tests, content validation, logging redaction, deletion audit.

## Priority cut line / recommended first 10 tasks

If working solo, start in this exact order:

1. `FND-001` Initialize Next.js app.
2. `FND-002` Set compatible dependencies.
3. `DOM-001` Define document model in millimeters.
4. `DOM-003` Build conversion helpers and tests.
5. `DOM-002` Validate model with Zod.
6. `AST-001` Implement safe file ingestion.
7. `AST-003` Implement asset repository.
8. `LAY-001` Implement uniform grid math.
9. `LAY-002` Expand quantities and pagination.
10. `EXP-001`/`EXP-002` Generate exact A4 PDF with a test image.

**First useful demo:** Upload one JPEG → choose 2×2 → type 12 copies → A4 (5 mm margin, 3 mm gap) → export and physically measure. Do this **before** building the advanced sidebar/tooling.

## Definition of Done (every task)

- [ ] Implementation matches written acceptance criteria.
- [ ] TypeScript strict typecheck passes, no unreviewed `any`.
- [ ] User input validation and failure mode implemented.
- [ ] Unit/integration/E2E test appropriate to feature added/updated.
- [ ] No relevant geometry drift or reduction in effective image resolution.
- [ ] Changes do not save image binaries into localStorage/Zustand snapshots.
- [ ] Keyboard/focus and accessible labels handled for new interactive UI.
- [ ] Performance and memory implications assessed for photo-scale files.
- [ ] Task documentation or schema changelog updated if behavior changes.

## Known risks and mitigations

| Risk | Mitigation | Earliest task |
| --- | --- | --- |
| Screen pixels confused with physical dimensions | Canonical millimeter model, two independent renderers, calibration | DOM-003 |
| Blurry PDF from exporting Konva canvas at screen resolution | Export from originals, not Stage screenshot | EXP-002 |
| Crop mismatch and EXIF double-rotation | Normalize orientation once, use crop in normalized source pixels | AST-002 / EXP-003 |
| Transformer scale accumulating after resize | Normalize scale into width/height once per commit | EDT-004 |
| Memory crash from large photos | Limits, thumbnails, one image crop at a time, reuse encoded crops | AST-001 / EXP-003 |
| Lost photos on refresh | IndexedDB binary storage + save status + portable bundle | PER-001–003 |
| PDF crop/text differs from canvas | Shared geometry, golden print tests, font metrics tests | EDT-012 / ADV-003 |
| Prints wrong size due to driver scaling | Calibration page; explicit 100% / Actual Size instructions | EXP-008 |
| Passport template mislabeled compliant | Generic preset + source-of-truth requirement per jurisdiction | DOM-004 |
| Unauthorized customer image access (future) | No cloud initially; server-side tenancy and retention policies | BIZ-001–003 |

## Release checklist: printable MVP

- [ ] A4/Letter/4R PDF dimensions verified using pdf-lib readback.
- [ ] 1×1/2×2 generated at physically correct sizes.
- [ ] Multiple images and quantities produce correct ordered sheets.
- [ ] UI warns on DPI, missing assets, overflow and printer margin concerns.
- [ ] Undo/redo and image reload work.
- [ ] PDF download tested in Chrome, Edge, Firefox and Safari as practical.
- [ ] Image originals remain local; users can delete projects/assets.
- [ ] Printing at 100% tested with ruler; known printer-specific caveats documented.
- [ ] Privacy notice and client-only processing claim accurately describe behavior.
- [ ] Optional features not implemented are clearly labeled as future work.
