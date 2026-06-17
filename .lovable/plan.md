# BookStack Clone on `/documents`

Goal: rebuild `/documents` as a feature-complete BookStack clone — Shelves → Books → Chapters → Pages, both Markdown and WYSIWYG editors, revisions, comments, attachments, image manager, exports, search, per-book permissions — using the existing dark design tokens. No Supabase migrations are applied automatically; every schema change lands in `supabase/pending/` for your manual review per repo rules.

## Mapping to what already exists

```
BookStack            →  This codebase
─────────────────────────────────────────────
Shelf                →  knowledge_spaces        (exists)
Book                 →  knowledge_categories    (exists, rename in UI to "Book")
Chapter              →  NEW table knowledge_chapters
Page                 →  knowledge_articles      (exists; gains chapter_id)
Revision             →  knowledge_article_revisions (exists)
Comment              →  NEW table knowledge_comments
Attachment           →  existing knowledge_attachments (exists)
Image (gallery)      →  NEW table knowledge_images + storage bucket
Permission (per book)→  NEW table knowledge_entity_permissions
```

The terminology in the UI becomes Shelves/Books/Chapters/Pages. The DB keeps its current table names (spaces/categories/articles) to avoid breaking every other feature; only the new `chapters`, `comments`, `images`, `entity_permissions` tables are added.

## Milestones (one PR each, per repo discipline)

### M1 — Route shell + Shelves/Books grid (UI only, no schema)
- `src/routes/documents.tsx` becomes a layout with `<Outlet />`.
- New leaves: `documents.index.tsx` (shelves grid), `documents.shelves.$shelf.tsx` (books grid), `documents.books.$book.tsx` (chapter/page tree + book home), `documents.books.$book.$page.tsx` (page view), `documents.books.$book.$page.edit.tsx` (editor).
- BookStack-style three-pane layout: left sidebar (shelf/book tree), main, right rail (info / contents / tags). Dark theme tokens only.
- Breadcrumbs (Shelves > Book > Chapter > Page), recent + popular widgets on home.
- Uses existing `useKnowledgeBackend`; chapters appear as virtual groups by category until M2 lands.

### M2 — Chapters table (schema, staged)
- New migration `supabase/pending/20260618000000_knowledge_chapters.qa.sql`:
  - `knowledge_chapters` (id, team_id, space_id, category_id, name, slug, description, sort_order, …)
  - `ALTER knowledge_articles ADD COLUMN chapter_id uuid NULL REFERENCES knowledge_chapters(id)`
  - GRANTs + RLS scoped via `has_team_permission('knowledge.read'/'.write')` mirroring existing pattern.
- Frontend reads `chapter_id` if present, falls back gracefully so the UI works pre-apply.
- Chapter CRUD dialogs (create/edit/delete/reorder via drag handle).

### M3 — Page view + dual editor
- Page view: rendered Markdown with TOC sidebar, "Edit / Revisions / Permissions / Export" actions, last-edited byline, tag chips.
- Editor route with mode toggle:
  - **Markdown** — reuse existing `MarkdownEditor`.
  - **WYSIWYG** — add Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-table`, `@tiptap/extension-task-list`). Stored as HTML in a new `content_html` column (migration in `supabase/pending/`); rendered side stays Markdown OR HTML based on `editor_mode` column.
- Autosave draft to `localStorage` per page, "Discard draft" button, BookStack-style toolbar.

### M4 — Revisions, comments, activity
- Revisions diff viewer (side-by-side + unified) using `diff` lib; restore-to-revision uses existing `restoreArticleToDraft` extended.
- New migration: `knowledge_comments` (threaded, page-scoped, soft-delete) with RLS.
- Comment thread under each page, @mention autocomplete against team members, edit/delete own, resolve thread.
- "Activity" tab on book/page showing audit events (reuse `knowledge_events`).

### M5 — Attachments + image manager
- Attachments panel per page using existing `knowledge_attachments` + storage bucket; drag-drop, list view, file-type icons, download/replace/delete.
- Image manager modal (BookStack parity): gallery grid scoped to team, upload, drag into editor, alt text, delete. New table `knowledge_images` + `knowledge-images` storage bucket policy (staged migration).
- Editor "Insert image" opens the manager.

### M6 — Search, exports, tags
- Full-text search across pages/chapters/books in current team using Postgres `tsvector` GIN index (staged migration) — search bar in top of `/documents`, results page with snippets and entity-type chips.
- Export per page and per book: HTML (clean printable), Markdown (zip for book), PDF (client-side via `jspdf` + `html2canvas` to honor the Worker server-runtime ban on `puppeteer`/`sharp`).
- Tag editor: reuse existing `knowledge_tags` / `knowledge_article_tags`; add tag pages (`/documents/tags/$tag`).

### M7 — Per-book permissions + polish
- New table `knowledge_entity_permissions(entity_type, entity_id, role_id, view, create, update, delete)` (staged migration) layered over existing team permissions; `has_role` SECURITY DEFINER style helper.
- UI: "Permissions" dialog per shelf/book/chapter/page with role grid.
- Final polish pass: empty states, skeletons, keyboard shortcuts (`/` search, `e` edit, `g h` go home), 404/error boundaries on every new route, a11y check.

## Technical details

- **No automatic DB applies.** Every schema change is a new file under `supabase/pending/`. The status doc `docs/PRODUCTION_HARDENING_STATUS.md` gets a new entry per milestone, per repo rules.
- **Server boundary.** Mutations go through `createServerFn` in `src/lib/knowledge/*.functions.ts` (chapters, comments, images, permissions, export). Reads stay in the existing hook pattern. No `supabaseAdmin` for ordinary reads.
- **Editor isomorphism.** Tiptap loads inside a client-only wrapper; SSR renders a static skeleton to avoid `window is not defined`.
- **PDF export** is client-only (`jspdf`) because the Worker runtime has no `puppeteer`/`sharp`.
- **Routing.** All new routes live under `src/routes/documents.*.tsx` with proper `errorComponent` + `notFoundComponent`. `/documents` becomes a layout returning `<Outlet />`; `documents.index.tsx` is the home leaf.
- **Theming.** Existing dark tokens only — no new color literals. BookStack's structural cues (card grid, three-pane layout, breadcrumb bar, contents rail) without its blue/white palette.

## Per-round size

Each milestone is one round (one PR-sized change). M1 is mostly UI and ships first so you can click around immediately. M2–M7 each touch ~3–6 files plus one staged SQL migration. Total: **7 rounds** to reach the full clone.

## What I need from you to start

1. Confirm the 7-milestone split and order.
2. Confirm staged-only SQL is fine (you apply migrations manually per repo rule).
3. Anything to drop from scope? Common cut candidates: per-book permissions (M7), PDF export (part of M6), image manager (M5 → keep attachments only).

Reply "go M1" and I start cutting code.
