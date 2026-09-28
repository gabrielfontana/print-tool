# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page web app that arranges bank payment receipts (JPG/PNG/PDF) onto A4 sheets for economical printing — pack several receipts per sheet instead of one-per-page. It replaces an earlier Python/Tkinter desktop prototype with the same core purpose, rewritten as a plain client-side web app for a nicer, more portable UI.

## Running / developing

There is no build step, no package manager, and no test suite — this is intentional, not incomplete setup.

- **Run it**: open `index.html` directly in a browser (double-click, or `file://` URL). It must keep working this way — do not introduce a dev server, bundler, or anything that assumes `http(s)://`.
- **Verify a change**: reload the browser and exercise the UI manually (add files, check the preview, toggle theme/orientation, use Ctrl+P print preview). There's no automated test harness in the repo; ad-hoc verification during development has been done by driving a temporary copy of the page with headless Chrome (`chrome --headless=new --screenshot=... file:///...`) — useful for regressions, but always clean up any temp/debug files afterward and never leave them committed.
- **Hard constraint**: every script is a classic `<script src="...">` in `index.html`, loaded in dependency order, and there are no `fetch()` calls against local files. Both are required for the page to work when opened via `file://` — converting anything to `type="module"` or ES `import`, or fetching a local JSON/asset, will silently break under `file://` (module scripts and `fetch` are blocked/restricted there).

## Architecture

**Data flow**: `FileHandling` turns a dropped/picked `File` into one or more plain item objects → `app.js` holds them in `state.items` → `Pack.computeLayout()` (pure, no DOM) turns the item list into a page geometry model in millimeters → `Render.renderPages()` turns that geometry into DOM, used identically for the on-screen preview and for the physical print output.

- `index.html` — script load order matters: `vendor/pdf.js` → `vendor/pdf.worker.js` → `js/icons.js` → `js/pack.js` → `js/pdfRender.js` → `js/render.js` → `js/fileHandling.js` → `js/app.js`. Also carries a small inline head script that sets `<html data-theme>` from `localStorage`/system preference before first paint (avoids a theme flash).
- `js/pack.js` — pure layout math, no DOM/File access. `computeLayout(items, {orientation, marginMm, gapMm})` returns pages of `{item, x, y, w, h}` placements in mm.
  - Packing is **First-Fit Decreasing Height** (sort by fitted height descending, then greedy shelf-pack): it optimizes for fewer pages, and deliberately does **not** preserve the order items were added in. `packSingle` (the "1 per page" mode) is the exception — it keeps input order.
  - `NATIVE_DPI = 150` is the assumed px-per-mm used only to cap "never upscale past native resolution" (chosen to match the old Python tool's DPI=150 page canvas). Raising this constant makes every receipt render smaller for the same source pixel count — it directly caused a "images too small" regression once, so don't bump it without a reason.
  - `MIN_ITEM_W_MM = 65` is a legibility floor (`ensureReadableSize`) that overrides the no-upscale rule when needed, so a batch of small/narrow receipts doesn't get crammed many-per-row at an unreadable size just because the math says they fit.
- `js/pdfRender.js` — turns one PDF `File` into N items, one per page (`"arquivo.pdf (pág. N)"` labeled only when the PDF has more than one page), each rasterized to a PNG via pdf.js canvas rendering. Downstream code (`pack.js`, `render.js`) treats a PDF page exactly like an uploaded image; there's no special-casing.
  - `vendor/pdf.worker.js` is loaded as a **plain `<script>` tag, not as a real Worker**. This is deliberate: it makes `window.pdfjsWorker` exist before any `getDocument()` call, so pdf.js's own internal fallback picks its main-thread "fake worker" path immediately instead of first trying to spin up a real `Worker(vendor/pdf.worker.js)` — which under `file://` can fail to ever signal ready/error and hang indefinitely rather than throw. Don't "clean up" this script tag or convert it to a real worker without re-testing PDF loading under `file://` specifically.
- `js/render.js` — the only module that builds page/print DOM. `buildPageEl`/`renderPages` create `.page` elements sized in real mm (`210mm × 297mm`, swapped for landscape) with each item absolutely positioned in mm — this is what keeps the on-screen preview and the printed output pixel-identical regardless of screen zoom. `setPrintPageSize()` rewrites the `#pageSizeStyle` `<style>` tag's `@page` rule to flip print orientation.
- `js/fileHandling.js` — File → item conversion and validation only (extension allow-list, dedupe by `name|size|lastModified`); no DOM, no layout.
- `js/app.js` — the only stateful module: owns `state`, wires up all DOM events (file add/remove/reorder, drag-and-drop, settings inputs, theme toggle, print), debounces layout recomputation, and renders the sidebar item list and toast notifications. Also owns the live on-screen `--scale` CSS variable that shrinks the true-size mm pages to fit the visible preview column (recalculated on resize).
- `js/icons.js` — a handful of inline SVG icon strings (adapted from Feather Icons, MIT), returned as HTML strings via `Icons.svg(name)`. No icon font, no external requests.
- `vendor/pdf.js`, `vendor/pdf.worker.js` — pdf.js `3.11.174` **legacy** UMD build, vendored (not npm-installed) so the app has zero external network dependency at runtime. If ever updated, both files must come from the same version and both must stay as the "legacy" build (targets older/plain `<script>` loading, not the ES-module build).

## Printing model

There is no PDF-export/download feature by design — "Imprimir" calls `window.print()` directly against the same mm-sized DOM the preview uses, styled via `@media print` in `css/style.css` (page chrome hidden, `.page-frame`/`.page-wrap` sizing constraints relaxed back to true physical size, `@page { size: A4 ...; margin: 0 }`). If you need to change print output, change `render.js`'s DOM/CSS, not a separate export path — there isn't one.

## Theming

Dark/light theme is a manual toggle (`data-theme` attribute + `localStorage`), not just a `prefers-color-scheme` follow. The **sidebar is intentionally dark in both themes** (fixed brand identity, not theme-dependent) and the **A4 page previews are always white** (they represent physical paper) — only the surrounding app chrome (toolbar, background, cards) switches with the theme. Keep this distinction when touching CSS variables in `css/style.css`.
