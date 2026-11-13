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

Database: `sdms-print-studio`.

| Store | Key | Contents |
| --- | --- | --- |
| `projects` | Project UUID | Schema-version-1 job, revision, timestamps, title and print summary |
| `assets` | Immutable source UUID | Full-resolution Blob, mime, dimensions and thumbnail Blob |
| `preferences` | Preference name | Last active saved project ID |
| `packages` | Package UUID | Name and size/count definition; unique normalized-name index |

Every save validates and strips runtime fields, then writes project metadata, new source assets and the last-project preference in one transaction. Writes for this workspace are serialized; revisions reject stale edits from another tab. Save copy can preserve a conflicting tab's work under a new project ID. Saving never overwrites immutable source bytes. Storage errors leave the in-memory job intact and show retry guidance.

Modules are under `src/features/studio/`. Repository/history/package tests use `fake-indexeddb`; run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. Browser QA covers original-photo recovery, edit/crop retention, package undo, removed-photo recovery, project switching, Save copy, custom package reuse and PDF download after reload.
