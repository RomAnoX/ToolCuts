# ToolCuts

A small macOS desktop app that keeps web tools (URLs) on a board of shortcut boxes. Clicking a box opens that URL in its own native window. Built on **tinyjs** (txiki.js backend + native WKWebView window, no Electron, no HTTP server).

- Repo: https://github.com/RomAnoX/ToolCuts (branch `main`, MIT)
- Releases: `v0.1.0` (first), `v0.2.0` (theme setting, trash icon, close button for open tools). Each has a universal DMG attached to its GitHub Release.
- Before changing anything tinyjs-related, read `.claude/skills/tinyjs/SKILL.md` and the files in `.claude/skills/tinyjs/references/` (api.md, platforms.md, recipes.md, release.md). `.agents/skills/tinyjs/` is an identical copy for other agent tools.

## Commands

```sh
tinyjs dev                          # run with hot reload (frontend edits swap in place, backend edits restart)
tinyjs build --dmg                  # dist/ToolCuts.app + dist/ToolCuts-<version>.dmg (host CPU only)
tinyjs build --dmg --universal      # Intel + Apple Silicon (this is what the release uses)
TINYJS_DEBUG=1 tinyjs dev           # trace every bridge message
```

There is no test suite, bundler, or package.json. The frontend is plain HTML/CSS/JS served as real files (`file://`).

## Layout

```
tinyjs.json          app config: name/title "ToolCuts", size 960x640, id, api.origins gate
icon.png             1024x1024 app icon, transparent squircle with ~10% margin
src/main.js          backend (txiki.js): `api.closeWindow({ id })` (closes a tool window on request) and onWindowClosed, which pushes 'tool-closed' to the page
src/frontend/
  index.html         header, board container, 4 <dialog>s (add, configure, settings, search palette)
  style.css          all styles; CSS variables; light is the default, dark comes from the media query unless `data-theme="light"`, or from `data-theme="dark"`
  app.js             all board logic
  icons.js           Lucide icons bundled as inline SVG markup (ICONS map + icon() helper)
  tool.html          tiny page that redirects its window to a tool's URL
  logo.png           128px copy of icon.png for the header and empty-state hero
docs/images/         README screenshots
types/               tinyjs type definitions (from the scaffold)
```

## Architecture

**Data** lives in `tiny.store` (persisted by tinyjs, keyed by the app `id`):
- `tools`: array of `{ name, url, description?, icon? }`. `icon` empty means use the favicon; otherwise an emoji/text or an `http(s)` image URL.
- `settings`: `{ confirmDelete: true, view: 'grid' | 'list', theme: 'system' | 'light' | 'dark' }`. Theme is applied by `applyTheme()` as `data-theme` on `<html>`; with `system` the attribute is removed and the `prefers-color-scheme` media query decides.
- `open:<windowId>`: temporary, the URL a just-opened tool window should load. Deleted when that window closes.

**Opening a tool** (`openTool` in app.js): store `open:<id>` = URL, call `tiny.win.open(id, { page: 'tool.html', ... })`. `tool.html` reads `tiny.win.id`, looks up the URL in the store, and does `location.replace(url)`. The dashboard tracks `open[windowId] = url` to render the "open" state.

**Open-state tracking**: backend `onWindowClosed` (src/main.js) calls `app.push('tool-closed', id)`; the page listens with `tiny.api.on('tool-closed')`, drops the entry, deletes the store key, and re-renders. State is in memory only: reloading the dashboard forgets which windows are open. An open tool shows a close button (top-left of its box, inline in list view) that calls `tiny.api.call('closeWindow', { id })` for every window opened for that tool; the page cannot close other windows itself, hence the backend method. On startup the dashboard deletes leftover `open:*` store keys from windows that were open when the app quit.

**Adding a tool**: `normalizeUrl` (prepends `https://` when no `http(s)://` is typed), then `fetchMeta` uses `tiny.fetch` (backend-proxied, no CORS) and `DOMParser` to read `<title>` and `meta[name=description]` / `og:description`. Name falls back to the hostname. Favicons come from Google's `s2/favicons` service, and broken images fall back to the Lucide `link` icon (a capture-phase `error` listener on `document`).

**Shortcuts**: ⌘N (new tool) and ⌘K (search palette) are items in a native `Tools` menu set with `tiny.menu.set` and handled by `tiny.menu.on`. They are not key listeners.

**Rendering**: `render()` rebuilds the whole board with `innerHTML`; handlers use event delegation on `#grid`. Everything interpolated into HTML goes through `esc()` (required: the page holds an RPC channel to a full-access backend).

**UI design**: "Launchpad + command palette" direction. Large icons on uniform rounded plates (so mixed favicons look consistent), frosted sticky header, system font, hover-only per-tool controls (copy URL, configure, remove) that also show on keyboard focus, ⌘K palette, grid/list toggle (list shows description under the name), drag to reorder, empty-state hero banner.

## Decisions and why

- **Separate windows instead of an iframe.** Many sites (Google, GitHub, most SaaS) send `X-Frame-Options`/`frame-ancestors` and render blank in an iframe. A top-level navigation in its own window is not subject to that. The original iframe viewer was removed.
- **Security: `"api": { "origins": { "file://*": "all" } }` in tinyjs.json.** `tiny` is injected into every origin, so without this any site opened in a tool window could call the backend (full filesystem and process access). Only the app's own local pages may call it. Do not remove it. Tool windows therefore cannot use `tiny.*` at all.
- **URL passed through `tiny.store`, not a query string.** `tiny.win.open`'s `page` is a file path; `tool.html?url=...` was treated as part of the filename and failed.
- **Shortcuts via the native menu.** macOS menus claim ⌘ key equivalents before the webview sees them, so a `keydown` listener would not be reliable. Verified working in the built app with System Events keystrokes.
- **Lucide icons vendored as inline SVG** (`icons.js`), no icon font and no CDN, so the app works offline and icons follow `currentColor` for light/dark. To add an icon, strip the outer `<svg>` tag and put only the inner markup in `ICONS`.
- **No build step, no dependencies.** Plain files, one JS file for logic. Keep it that way unless a real need appears.
- **Window title**: `tinyjs.json` has `title: "ToolCuts"` and `app.js` also calls `tiny.win.setTitle('ToolCuts')` because dev mode showed the lowercase `toolcuts`. The built app showed "ToolCuts" correctly.
- **Releases, not committed binaries.** The installer is a GitHub Release asset. `dist/`, `.build/` and `.remember/` are git-ignored.

## Gotchas learned the hard way

- Click targets can be the `<svg>`/`<path>` inside a button. Use `e.target.closest('[data-del],[data-cfg],[data-copy]')`, never `e.target.dataset` directly.
- When extracting Lucide SVGs, a naive regex copied the outer `<svg>` too. The result was nested SVGs that swallowed the button label text. `icons.js` was regenerated correctly; keep the "inner markup only" rule and the `assert '<svg' not in inner` check if scripting this again.
- `<dialog>` forms: Cancel buttons are `type="button"` with a click handler calling `close()`; add and configure forms use `preventDefault` and close manually after validating. Calling `showModal()` on an already-open dialog throws, so the menu handler skips when any `dialog[open]` exists.
- Never declare a top-level `chrome` identifier in frontend code (WebView2 parse error); the tinyjs SKILL covers this.
- The Google favicon service returns a generic globe for sites with no favicon (that is a successful image, so the 🔗/link fallback does not trigger).

## Verifying changes

- The app window needs a display, so `tinyjs dev` cannot run headless. To check UI without it: copy `src/frontend` to a scratch folder, inject a stub `window.tiny = { store, api, win, dialog, fetch, menu, clipboard }` before `icons.js`, and screenshot with `Google Chrome --headless=new --screenshot=... file://.../index.html`. This was used to catch the broken-icon bug.
- Built-app check: `tinyjs build --dmg`, mount the DMG, `codesign --verify --deep --strict`, launch, then screenshot the window (it opened on a secondary display; find bounds with System Events and use `screencapture -R`). `osascript ... keystroke "n" using command down` exercises ⌘N and ⌘K.

- Verified with a self-driving test page (`TINYJS_HTML=/abs/test.html tinyjs dev`, results written to `~/Library/Application Support/com.example.toolcuts/store.json` via `tiny.store.set('results', ...)`): `closeWindow` closes the window, and `onWindowClosed` receives the bare window id string. Back up and restore store.json around such tests, because the test runs against the real app data.
- Synthetic clicks from System Events (`click at`) do not reach web content in the built app. Use ⌘K/⌘N keystrokes to drive it; CGEvent mouse clicks were unreliable here.

## State and open items

- Done: board, smart add, configure dialog (name, URL, description, icon, fetch description), settings (confirm-on-delete), grid/list views, theme setting (system/light/dark), search palette, ⌘N/⌘K, copy URL, drag reorder, open-state indicator, empty-state hero, README with screenshots, `v0.1.0` and `v0.2.0` releases (universal, ad-hoc signed). Release flow: bump `version` in tinyjs.json, `tinyjs build --universal --dmg`, verify, commit and push, then `gh release create vX.Y.Z dist/ToolCuts-X.Y.Z.dmg`.
- **Not notarized.** The owner has no Apple Developer account yet. Users get a Gatekeeper warning; the README and release notes document right-click → Open and `xattr -dr com.apple.quarantine`. To fix: enroll in the Apple Developer Program, create a "Developer ID Application" certificate, run `xcrun notarytool store-credentials`, set `signIdentity` and `notarize.profile` in tinyjs.json, then `tinyjs build --universal --dmg && tinyjs notarize --universal --dmg`, and remove the workaround text.
- **Bundle id is still the placeholder `com.example.toolcuts`.** It keys users' saved data and is baked into signing, so change it (e.g. `com.romanox.toolcuts`) before many people install, or they will lose their tools on the switch. Requires a new release.
- Unverified assumptions to check when convenient: which window receives a menu click when several windows are open (⌘N/⌘K only act in the dashboard).
- Ideas not built: reuse/focus an already-open tool window instead of opening a second, remember open windows across dashboard reloads, import/export of tools, categories, a file picker for custom icons, Windows/Linux testing (tinyjs supports them in beta; ToolCuts is only tested on macOS).
- The template's unused backend functions (`sysinfo`, `listDir`, `readFileHead`, the `tick` timer) were removed; `src/main.js` is now just an empty `api` plus `onWindowClosed`.

## Working notes

- The repo's README is user-facing; this file is for future Claude sessions. Update both when behavior changes.
- Commits in this project end with the `Co-Authored-By` attribution line used so far.
