# Saved projects, history and ID packages

Quick Print saves jobs automatically after 650 ms without a change. A job includes its name, paper, orientation, margins, gaps, cut marks, fitting option, photo sizes, quantities, crops and brightness/contrast. Original normalized JPEG/PNG pixels and thumbnails are stored separately in IndexedDB. PDF export continues to use the original source dimensions after reopening a job.

Use **Projects** to reopen a saved job, **New** for an empty job, **Save** for an immediate write, and **Save copy** for a separate project. The last opened saved project restores on reload. An untouched new job is saved when first edited or when Save is pressed. Changing projects first finishes saving the current edits; a failed save keeps the current workspace open.

Storage belongs to this browser profile and site address. It is not synchronized to another computer or browser. Clearing site data, private browsing or browser storage eviction can remove saved jobs. Wait for **Saved locally** before closing. Portable project files and project/asset deletion are separate backlog items, PER-003 and PER-004.

## History

Undo and redo retain up to 50 metadata snapshots per open job. Uploads and package application each count as one action; crop and photo adjustments enter history when applied. Numeric field edits and the project name group until the field loses focus. Original image blobs and object URLs are excluded from history. An asset's preview URL stays alive while any undo/redo snapshot references it, then is revoked. Opening another project or saving a copy starts a new history session.

Shortcuts: Ctrl/⌘ Z to undo; Ctrl Y or Ctrl/⌘ Shift Z to redo. Inputs, selects, editable text and open dialogs retain their own keyboard behavior. Uploads, exports and project changes temporarily disable workspace history controls.

## ID packages

Built-in combinations are four 2×2 plus eight 1×1, six 2×2, and fifteen 1×1. Applying a package replaces only the selected source photo's entries. Matching sizes keep their crop and adjustments; new sizes start centered and inherit that photo's adjustments. Package application disables one-sheet shrinking so the ID dimensions remain exact. Paper, margins, gaps and cut marks stay as selected.

To save a custom combination, set one photo's ID sizes and quantities, open **Save your own combination**, enter a name, and press **Save ID set**. Custom packages store sizes and counts only, with no customer photo, filename, crop or effects. Package names are unique regardless of case.

Use the trash icon on a custom package and confirm **Delete package** to remove it from this browser. Cancel keeps the package. Deleting a saved combination does not change photos already arranged in a project. Built-in packages remain available. A deleted name can be reused.

## IndexedDB version 1

### Manual layout and background edits

**Edit layout** above the sheet preview opens a paper editor. Each printed copy can be selected, dragged, rotated, aligned horizontally/vertically, positioned using X/Y in millimeters, or moved to another sheet. Arrow keys move 1 mm, Shift + arrow moves 5 mm. The editor has its own undo/redo and Apply/Cancel; applying is one workspace undo action. Rotated corners stay inside the paper. Deliberate overlaps are allowed. Photo sizes are preserved, including an existing one-sheet fit scale.

Manual positions autosave with the job. Crops, brightness/contrast, cut marks and background edits preserve those positions. Changing paper, orientation, margins, gaps, sizes, order or quantities returns to automatic arrangement; workspace Undo restores the previous manual layout. **Use auto layout** explicitly clears manual positioning. Added empty sheets are intentional printable sheets.

The eraser icon beside each photo opens **Background cleanup**. Pick a backdrop color or use **Remove corner backdrop**, adjust tolerance, and correct the mask with Erase/Restore. This connected-color method works best on plain ID-photo backgrounds; it does not perform AI subject segmentation. The output can be transparent or filled with white, blue, red or a custom color. Apply affects that entry's copies, preserves its crop/effects, and can be undone from the workspace.

Background edits create new full-resolution PNG source assets with an `originalId`, full-resolution alpha-mask Blob and selected background color. Original pixels are never overwritten. Reopening the editor reloads that original and mask so erased edges remain restorable, including after page reload or Save copy. History and persistence keep original dependencies until no active history entry needs them. PNG source dimensions stay unchanged in PDF export.

The schema-version-1 job now accepts an optional `manualLayout` (fit scale and sheets of stable item/entry IDs, mm positions and clockwise rotation). Existing jobs without it retain automatic layout. Asset records accept the optional background fields above; no IndexedDB store migration is required. Geometry and source bytes remain separate from UI object URLs.

Database: `sdms-print-studio`.

| Store | Key | Contents |
| --- | --- | --- |
| `projects` | Project UUID | Schema-version-1 job, revision, timestamps, title and print summary |
| `assets` | Immutable source UUID | Full-resolution Blob, mime, dimensions and thumbnail Blob |
| `preferences` | Preference name | Last active saved project ID |
| `packages` | Package UUID | Name and size/count definition; unique normalized-name index |

Every save validates and strips runtime fields, then writes project metadata, new source assets and the last-project preference in one transaction. Writes for this workspace are serialized; revisions reject stale edits from another tab. Save copy can preserve a conflicting tab's work under a new project ID. Saving never overwrites immutable source bytes. Storage errors leave the in-memory job intact and show retry guidance.

Modules are under `src/features/studio/`. Repository/history/package tests use `fake-indexeddb`; run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. Browser QA covers original-photo recovery, edit/crop retention, package undo, removed-photo recovery, project switching, Save copy, custom package reuse and PDF download after reload.
