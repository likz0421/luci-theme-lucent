# Changelog

All notable changes to Lucent are documented here. The project follows
[Semantic Versioning](https://semver.org/).

The 3.x line was retired on 2026-11-04 and its GitHub releases and tags were
removed; the version numbering restarts at **0.1** from here. The feature notes
below describe what the theme does today — the 3.x history is kept underneath
for reference.

## 0.1 — 2026-11-04

Restart of the version line. Everything below is what this release contains.

### Dashboard

- Hero panel with greeting, daily line, WAN/LAN address, uptime and model.
- KPI row: WAN address, device count, live throughput, uptime, memory, storage.
- **Network path card**: Internet → this router → LAN/WiFi as clickable nodes
  with live per-link rates, plus a summary strip (current traffic, connected
  time, active networks, busiest network).
- **Traffic trend**: rolling down/up curve sampled every 10 s, with a relative
  time axis, hover readout, session history and a persisted daily peak.
- Health card: CPU / memory / load dials, a used-cache-free memory split bar
  with a legend, and per-core busy bars.
- Top talkers and per-host rates, driven by conntrack accounting when the user
  turns it on in Appearance.
- Update banner with an automatic version check, a progress bar during the
  online upgrade, and an upgradable-package count.

### Devices

- Device-class chips (phone / TV / camera / computer / printer / wearable /
  smart / network), sortable columns, a connections column, and a 15 s refresh
  that keeps the active filter.

### Look and behaviour

- Seven palettes, light/dark/auto, glass on/off, blur and opacity sliders,
  density, greeting, wallpaper (including a daily Bing auto-fetch cron), and a
  three-state theme cycle.
- Collapsible icon rail on desktop, drawer + bottom dock on phones, command
  palette, keyboard focus rings, and `prefers-reduced-motion` handling.

### Installer

- One-key online install / upgrade / uninstall with mirror fallback, a terminal
  menu (1 install, 2 uninstall), version detection that upgrades an old install
  and refuses a downgrade, gzip validation of every download, and an exhaustive
  uninstall that self-audits for leftovers.

### Fixed since 3.12.2

- **The menu never accepted a choice.** `$(ask …)` captured the prompt text
  along with the answer, so every input fell through to "没听懂". `ask()` now
  answers through `ANSWER` and prints the prompt to stderr.
- **Version-line reset handled explicitly.** A 0.x target now replaces a 3.x
  install instead of being refused as a downgrade, and the reverse — a stale
  mirror pointer trying to push a retired 3.x build onto a 0.x machine — is
  refused even though 3.x sorts higher numerically.

<details>
<summary>3.x history (retired)</summary>

## 3.12.2 — 2026-11-04

Two failures reported from a real router running the one-key command.

### Fixed

- **`apk` upgrades failed outright on routers that had ever been installed by
  file copy.** The install stopped at
  `ERROR: luci-theme-lucent-3.12.1-r1: trying to overwrite usr/lib/lua/luci/i18n/…`
  because a tar.gz / offline install drops its `.lmo` catalogues and theme
  files on disk without any package owning them, and apk refuses to write over
  a file that belongs to nobody. The installer now recognises that specific
  error and retries once with `--force-overwrite` — these files are ours by
  definition — and reports that it did. Any other apk failure is left to fail
  loudly as before; the retry is deliberately not a blanket `--force`.
- **The menu did not appear for the documented command.** The copy served from
  `cdn.jsdelivr.net/gh/…@main/install.sh` was a 3.10.12-era cached file, which
  predates the menu entirely (the run's own first line, "脚本内置默认
  3.10.12-r1", gave it away). The header docs and the README uninstall example
  now lead with `releases/latest/download/lucent-install.sh`, which always
  resolves to the newest release and cannot go stale, and say plainly why the
  `@main` CDN path may hand back an old script.

### Verified

- `sh tests/install-apk-retry.sh`: new suite. It runs the real installer
  against a stubbed router whose `apk add` fails with exactly that error, and
  asserts the conflict is shown, the retry happens with `--force-overwrite`,
  and the install exits 0; then it swaps in a different apk failure and asserts
  the script does *not* force-overwrite and still fails. 7 checks, no failures.
- `sh tests/install-logic.sh` (25), `sh tests/uninstall-audit.sh`, and
  `node tests/run-harness.js` (15 scenarios / 844 assertions) all clean.

## 3.12.1 — 2026-11-04

### Fixed

- **The menu now appears for the one-key command itself.** 3.12.0 only showed
  it when stdin was already a terminal, which `wget -qO- … | sh` never is — so
  the command most people actually run skipped it entirely. The prompt reads
  from `/dev/tty` when stdin is taken by the pipe, and falls back to the old
  fully automatic behaviour only when there is genuinely no controlling
  terminal (CI, cron, reflashing a batch of routers).
- **Uninstalling leaves nothing behind.** The removal pass now covers every
  path the theme can touch: all shipped `.lmo` catalogues rather than the two
  zh-cn names we happened to have today, `/usr/share/lucent` including the
  wallpapers fetched at runtime, `/tmp/lucent-*` and `/var/run/lucent-*`, the
  uci section, and the `luci.languages.zh_cn` entry when no Chinese catalogue
  survives.
- **The package's own removal scripts did the same.** `postrm` / `post-deinstall`
  previously reset the theme and deleted the htdocs directory, but left the
  cron entry, the wallpaper cache and the helper's caches behind — those are
  runtime files the manifest never listed, so the manager cannot remove them.
- **The offline one-key installer never deleted `/usr/share/lucent`** at all.
- **Removal scripts report failure when they miss something.** Each uninstall
  path now finishes with a self-audit and exits non-zero, naming the paths
  still present, instead of always printing "卸载完成".
- **`set -e` could abort the installer on a plain predicate.** `[ -c /dev/tty ]`
  and the `[ -e x ] && LEFT=…` audit lines were written as bare AND-lists, whose
  non-zero status some shells treat as fatal even in a condition context. They
  are explicit `if` blocks now.

### Removed

- The `-u` / `UNINSTALL=1` / `卸载` argument aliases added in 3.12.0. The menu
  made them redundant, and three spellings for one action is three things to
  remember.

### Verified

- `sh tests/install-logic.sh`: 25 checks, no failures. The two terminal
  branches are driven by splicing a stubbed `has_tty` in before the dispatch,
  because touching `/dev/tty` from the Windows test box kills the shell — which
  is also the proof that the real device is never read when there is no
  terminal.
- `sh tests/uninstall-audit.sh`: new suite. It plants a full install into a
  fake root (18 entries, including a cron line that must survive alongside an
  unrelated one), runs a path-rewritten copy of `uninstall.sh` against it, and
  asserts nothing lucent-shaped remains and the audit exits 0; it then deletes
  one removal line from the copy and asserts the audit fails and names that
  path.
- `node tests/run-harness.js`: 15 scenarios, 844 assertions, no failures.

## 3.12.0 — 2026-11-04

### Added

- **Interactive menu in `install.sh`.** Running the script from a shell with no
  argument now lists 安装/升级 · 检查更新 · 一键卸载 · 查看状态 instead of
  jumping straight into an install. It only appears on a real terminal: under
  `wget -qO- … | sh` stdin *is* the script, so reading an answer there would
  truncate the install halfway. Piped runs keep the old non-interactive
  behaviour.
- **Version detection before anything is touched.** Every action now starts
  with `本机状态：已安装 3.10.12-r1（apk 方式）` or `未安装`. Detection covers
  all three ways the theme can be on a router: an apk record, an opkg record,
  and a file-copy install (whose only trace is the version marker, or the
  theme directory alone when the marker is missing).
- **An old install is upgraded, not silently overwritten.** When the router has
  an older version than the online latest, the script says so and proceeds to
  upgrade.
- **Downgrades are refused.** If the router carries a newer version than the
  source can offer — a stale mirror pointer, an offline package built from an
  older tag — the script explains that there is no way back from the web UI
  and asks; `LUCENT_FORCE=1` overrides.
- **Uninstall asks first**, and reports what it found when it finds nothing.
- The offline one-key installer carries the same detection and the same
  upgrade / downgrade messaging, so the two scripts cannot drift apart.

### Changed

- Running `install.sh` when the exact version is already installed now stops
  with "已是最新版" instead of re-downloading and re-installing it;
  `LUCENT_FORCE=1` restores the repair reinstall.
- `install.sh status` prints the detected version and install method instead of
  a package-manager-only summary, which read as "未安装" on file-copy installs.

### Verified

- `sh tests/install-logic.sh` — a new suite that runs the same assertions
  against both `install.sh` and `scripts/onekey-template.sh`: ordered version
  comparison including the `3.11.0 > 3.9.9` lexicographic trap,
  apk/opkg/marker detection, and that a piped stdin is never read.
  38 checks, no failures.
- `node tests/run-harness.js`: 15 scenarios, 844 assertions, no failures.

## 3.11.1 — 2026-11-04

A full read-through of the codebase — frontend, rpcd helper, installers,
packaging, CSS — with every finding re-checked against the source before it was
changed.

### Fixed

- **Uninstalling could leave LuCI blank.** `uninstall.sh` runs under `set -e`,
  and `uci delete luci.themes.Lucent` exits non-zero when that section was
  never registered, so the script died after deleting the files but before
  switching `mediaurlbase` back and clearing the caches. Every `uci` call in
  the removal path now tolerates a missing section.
- **The daily wallpaper job survived uninstall.** The cron line lives in
  root's crontab rather than in the package, so all three uninstallers
  (`uninstall.sh`, `install.sh uninstall`, the one-key script) now delete the
  `# lucent-wallpaper` entry, restart cron, and drop the `/tmp` caches and
  `/var/run` pid files the helper leaves behind.
- **A wallpaper API could hand wget its own options.** URLs returned by
  Unsplash and Wallhaven were passed straight to the downloader; a value
  beginning with `-` would have been parsed as a wget option running as root.
  `download()` now accepts only `http://` and `https://`.
- **An update could downgrade the theme.** Both the check and the update path
  treated "version differs" as "update available", so a stale mirror pointer
  would have installed an older build over a newer one. Comparison is now
  ordered, and a stale pointer reports "up to date" instead.
- **A captive portal could pose as an installer.** Downloads were accepted on
  size alone; the payload is now checked for the gzip magic that every apk,
  ipk and tar.gz asset starts with.
- **Lease remaining read "–" on every DHCP router.** netifd only puts a
  countdown on IPv6 entries, so the remaining time is now derived the way
  LuCI's own expiry widget derives it — lease time minus where the current
  uptime falls inside it — with the IPv6 fallback widened past the literal
  `wan6` name.
- **Per-host rates blamed the LAN for everything.** When `network.lan.ipaddr`
  was unset or not an address, the generated awk pattern ended in an empty
  alternation, which matches every host. The LAN prefix is only added when it
  parses as an address.
- **`plugin_check` blocked the rpcd worker** behind eight sequential package
  queries; one package-database read now answers all eight.
- **Storage used the wrong mount.** The helper reports `/overlay`, but the
  frontend looked for `overlay`, so squashfs routers showed the read-only root
  instead of the writable area that actually fills up.
- **Static and hosts-file entries invented phantom devices.** `getHostHints`
  keys those by IP or name; using that key as a MAC added rows whose MAC
  column showed an address. They now merge into the device they match.
- **A permanent lease looked expired.** odhcpd reports infinite leases as
  `0`, and some builds hand the epoch over as a string; both are now read
  correctly.
- **"Today" rolled at 08:00 in China.** The trend history and daily peak were
  keyed by the UTC date while the greeting used the local one. Daily keys are
  now local and yesterday's are pruned instead of accumulating forever.
- **The Top talkers card dropped its own hint** and wrote
  `class="ltc-card [object HTMLDivElement]"`, because the hint node was passed
  where a class name belongs.
- **The accounting switch always read "off"**, since `acct` was missing from
  the defaults table that the settings loader copies from.
- **Rate and age cells could render `width:NaN%`** and "NaNh ago" when a host
  had no counters yet.
- **An update could poll forever.** If the detached job never registered, the
  status timer ticked every two seconds until the tab closed; it now gives up
  after two minutes and says so.
- **The sidebar status panel leaked an interval per render**, keeping the
  previous page's DOM alive.

### Changed

- **The default palette is now genuinely Mist.** `:root` carried the Clay
  values, so any page rendered without a `data-palette` attribute — or with an
  unknown one — came out brown. The logo tile and favicon matched.
- **Glass: Off now covers every blurred surface** (the sticky save bar, the
  phone dock, the command palette, the login card).
- **Status colours are legible in dark mode.** Green, amber and red were only
  ever tuned for light surfaces and sat near 3:1 against dark cards.
- **Keyboard focus is visible.** The focus ring was the 11%-alpha tint; it is
  now built from the accent, and the search field no longer strips the outline
  without replacing it.
- **Phones lost the ~170px of dead space under the footer** (the footer and
  its own container both reserved room for the dock), and the dock no longer
  floats above an open menu drawer.
- **Older engines keep the layout.** `100dvh` and `color-mix()` now have
  `@supports` fallbacks, so a phone browser without them keeps its shell height
  and opaque surfaces instead of painting text over the wallpaper.
- The palette grid fills its row instead of leaving two empty cells, and the
  Appearance copy says seven palettes, which is what it shows. The opacity and
  dimming sliders now say plainly that they need a wallpaper to do anything.
- The packages declare `rpcd-mod-file`, which the wallpaper upload needs; the
  README's version numbers match the current release.

### Verified

- `node tests/run-harness.js`: 15 scenarios, 844 assertions, no failures —
  including a new `#dhcpwan` scenario that asserts a DHCP router reports both
  a lease countdown and a gateway read from the 21.02-style route field.

## 3.11.0 — 2026-11-04

### Fixed

- **The trend axis read "now now now now"** while the history was only seconds
  old — a chart that looks broken rather than young. Repeated tick labels now
  collapse, keeping only the rightmost one.
- **The Uptime card repeated its own number** as its sub-line
  (`12h 50m` above `12h 50m since boot`). The sub-line is now the boot
  timestamp (`since 2026-11-04 00:59`), which is the half that carries
  information.
- **Topology leaves with neither a lease nor a name showed a bare MAC**, which
  is indistinguishable from a rendering failure; they now say
  *no lease, no name*.
- **Top talkers rows had a second line only sometimes** (the age, when over
  20 s), leaving the card visibly ragged. Every row now has one: the address
  when the host is named, otherwise how long it has been quiet.

### Added

- **The trend history survives a browser restart.** Samples lived in
  `sessionStorage`, i.e. per tab, so every fresh tab redrew an almost empty
  chart for minutes — one of the "cards look half empty" reports. They are
  stored per day in `localStorage`, capped at 120 samples and 24 hours, so the
  curve is populated the moment the page opens.
- **KPI tiles gained a proportion.** Devices, Memory and Storage now carry a
  thin meter, and the Devices tile splits its count into online and
  Wi-Fi-associated hosts instead of a single number.
- The four tiles above the device table (Known devices / Active leases / Named
  hosts / IPv6 capable) gained the same second line and meter: a bare number
  hides its own denominator.
- The sidebar status panel **fades its bottom edge while it can scroll**, so a
  row ending at the cap reads as "more below" instead of clipped text. The
  fade is off in the rail and while the panel is collapsed, where nothing
  scrolls.

### Verified

- Fourteen harness scenarios, 0 failures. Dashboard and device page
  re-photographed at 1500×2700 (whole page in one picture) and 390 px drawer;
  boot timestamp, meters, talker rows, leaf labels and the panel fade checked
  in the pictures, not only in the DOM.

## 3.10.12 — 2026-11-04

### Fixed

- **`menu-lucent.js` never ran on a real router.** LuCI's `require()` does
  `new _class()` and invokes the constructor hook named **`__init__`** — with
  trailing underscores (`luci.js:2554`, `luci.js:69`). The theme defined
  `__init`, so the entire menu builder — cache restore, tree load, every
  fallback — was dead code on every page, and the sidebar was drawn only by
  the `core.js` watchdog at 7 s, or by the static menu at 16 s. This is the
  real reason the menu was slow, came back blank after every click, and why
  the 3.10.9 cache appeared to do nothing: the code that reads it had never
  been called.
- **The harness could not have caught this, because it repeated the mistake.**
  It instantiated modules by calling `res.__init()` — the same wrong name — so
  fourteen green scenarios were testing a constructor LuCI never invokes. It
  now calls `__init__`.
- **The source deadlines were cutting off a healthy request.**
  `ui.menu.load()` was abandoned after 2.5 s and re-requested through
  `admin/menu`, so a menu answering in 2.5–4 s took ~8 s to appear — the
  double-fetch penalty was measured in the real shell. The deadlines are now
  anti-hang guards (8 s each) rather than a race, and `admin/menu` gets 9 s of
  XHR timeout; with the cache painting first, nobody waits on them.

### Verified

- A local **real-LuCI simulation** — upstream `luci.js`, `ui.js` and `cbi.js`
  served beside the theme, with a fake router whose `admin/menu` answers after
  a configurable delay — driven through four genuine page loads in one browser
  profile, recording when `#topmenu` actually gains entries. Before this fix:
  every page painted at ~7.9 s, from the watchdog, with the cache never read.
  After: page 1 `menu:tree 1337ms`, pages 2–4 `menu:cache+tree ~960→990ms` —
  the cached menu paints at module-instantiation time and the router confirms
  it ~30 ms later. (Headless virtual time makes those numbers relative, not
  wall clock; the ordering is the point.)
- Fourteen harness scenarios still 0 failures; the failure scenarios now wait
  out the 8 s deadlines instead of asserting against the old 2.5 s ones.

## 3.10.11 — 2026-11-04

### Added

- **The marker now also says whether this browser allows storage at all.**
  `cache:off` is appended to the menu marker and `window.__lucentMenu.store`
  reports `on`/`off`. Private mode — and several embedded browsers on ONTs —
  refuses `localStorage` outright, which silently disables the instant paint
  from 3.10.9 and looks *exactly* like a broken cache from the outside. Now
  the page distinguishes "the cache is not being used" from "the cache cannot
  be used here".
- The probe is a single `setItem`/`removeItem` pair in `util.storageWorks()`,
  so the watchdog's marker carries the same field even when `menu-lucent.js`
  never ran.

### Changed

- Build marker is `#menu11`; the localStorage menu cache is keyed to it, so
  upgrading never repaints a structure from an older builder.

### Verified

- Fourteen harness scenarios, 0 failures (44–62 checks each). New
  `#menu-nostore`: `localStorage.setItem` throws, and the run asserts the menu
  still renders from the router's tree, the marker reads `cache:off`, and
  `__lucentMenu.store === 'off'`.

## 3.10.10 — 2026-11-04

### Added

- **The menu now says who drew it, and when.** Next to *Installed version* on
  the home page — and in the footer on every page — Lucent prints
  `menu:<source> <ms>ms <owner>`:
  - `menu:tree 659ms #menu10` — the router's tree, and how long it took;
  - `menu:cache 312ms #menu10` — painted from this browser's copy;
    `menu:cache+tree 312→1204ms` — painted instantly, then confirmed by the
    router;
  - `menu:builtin … #menu10` — the static fallback, whose reason is in the
    sidebar note;
  - `… #core` — the `core.js` watchdog drew it, meaning `menu-lucent.js`
    itself never ran;
  - **no marker at all** — the browser is still executing pre-3.10.10 JS.

  Every "still the same" report so far needed a console to tell these apart,
  which is why the fixes kept aiming at the wrong layer. `window.__lucentMenu`
  carries the same fields plus the entry count and the nav's measured pixel
  height.
- **The watchdog now separates the two failures that look identical from the
  outside.** No entries at all → it draws the static menu as before; entries
  that occupy zero pixels → it says so, with the item count and the measured
  height, because that is a layout failure and debugging the menu would find
  nothing wrong.

### Changed

- Build marker is `#menu10`; the localStorage menu cache is keyed to it, so an
  upgrade repaints from a fresh structure rather than an obsolete one.

### Verified

- Thirteen harness scenarios, 0 failures (52–62 checks each). Each one now
  asserts the marker names the right source *and* the right owner — `#menu10`
  for the builder, `#core` for the watchdog — and that the home card and the
  footer agree.

## 3.10.9 — 2026-11-04

### Fixed

- **The sidebar no longer waits for the router on every page.** LuCI reloads
  the whole document when a menu entry is clicked, and the menu was rebuilt
  from scratch each time — so after the first paint the column went empty
  again for as long as `ui.menu.load()` / `admin/menu` took. On a loaded ONT
  that is seconds per click, which reads exactly as "the menu comes out
  slowly and disappears when I navigate". The tree is now kept in
  `localStorage` **under the session id**, painted synchronously when
  `menu-lucent.js` is instantiated, and reconciled with the network
  afterwards. A different user never repaints someone else's ACL-filtered
  menu, and only one copy is ever stored.
- **Nothing clears the sidebar before a replacement is in hand.** The menu is
  rendered into detached containers and swapped in only once it has produced
  entries, so a slow, empty or failing response can no longer blank a working
  column. `build()` is also single-flight now: the 7 s watchdog and the 12 s
  last-resort rebuild cannot start a second chain that wipes what the first
  one already painted.
- **An unchanged tree is not repainted.** Trees are compared after rendering
  (the node names are filled in while rendering), so a reconcile that returns
  the same menu leaves the DOM — and the entrance animation — untouched
  instead of flickering.
- **A stale menu now admits it.** If the reload fails while the visible menu
  came from this browser, the sidebar says so with the reason and a Retry
  that drops the copy; if the router answers with a tree that has no sidebar
  in it, that answer wins and the cached copy is discarded rather than left
  standing as a ghost of a removed package or a revoked ACL.

### Changed

- `ui.menu.load()` deadline 4000 → 2500 ms and `admin/menu` 6000 → 5000 ms;
  with the cached first paint, reconcile latency is no longer something the
  user waits behind.
- The live status panel caps at 42% of the sidebar instead of 58%: at 808 px
  of viewport the navigation was being squeezed to 210 px. The panel scrolls
  internally, so nothing is lost — the menu is what has to stay readable.
- Build marker is now `#menu9`, and the cache is keyed to it, so an upgrade
  cannot repaint an obsolete structure.

### Added

- `tests/run-harness.js` runs every scenario in headless Edge and prints the
  assertion report (`node tests/run-harness.js`, `--shot` for pictures) — the
  check that used to be retyped by hand each release.
- New `#menu-cache` scenario: the network never answers, the cached tree must
  already be painted at module-init time, must survive the failure, must not
  be stacked twice, and must be labelled as cached. Every other scenario now
  starts from a cleared `localStorage`, so a healthy run cannot mask a
  fallback.

### Verified

- Thirteen harness scenarios, 0 failures: healthy tree (48), rejecting (51),
  empty (51), no `ui.menu` class (51), synchronous throw (51), module never
  loaded (54), requestpath matching no root child (48), hanging (53),
  **cached paint with a hanging network (58)**, 15-port bridge (51),
  simulated FTTR ONU (40), rail (48), phone drawer (48). Desktop and phone
  screenshots re-taken: menu painted, panel docked below it.

## 3.10.8 — 2026-11-04

### Fixed

- **Theme upgrades did not invalidate the browser's copy of the theme's JS.**
  LuCI builds every module URL as `<resource>/<name>.js?v=<resource_version>`,
  and `resource_version` comes from **luci.js**, i.e. the LuCI package version
  (`luci.js`:2474). Upgrading Lucent does not change it, so after an upgrade
  the browser kept serving the previous release's `menu-lucent.js`,
  `lucent/core.js`, `lucent/sideinfo.js` … — which is why several fixes were
  invisible on real devices no matter what shipped. The footer now sets
  `L.env.resource_version` to the theme's own version (the `/usr/share/lucent/
  version` marker, falling back to the stylesheet mtime, then to the LuCI
  version) before any `L.require`, so every theme module gets a per-release
  URL.
- **A synchronous throw inside `ui.menu.load()` could still leave the sidebar
  silent.** `__init`, `build()` and `render()` are each wrapped, `withTimeout()`
  tolerates a non-promise return, and missing `L.env.dispatchpath` /
  `requestpath` are handled — all of which a stripped ONT build can hit.
- **The built-in menu is no longer locked inside the module that usually
  draws it.** It moved to `lucent.util.js` (`util.builtinMenu()`), used by both
  the menu builder and the `core.js` watchdog, so a missing or broken
  `menu-lucent.js` still yields a usable menu rather than an apology.

### Added

- **The sidebar note now says which code drew it**: `… · #menu8` when the menu
  builder fell back, `The sidebar menu could not be loaded. · #core` when the
  watchdog did. "Am I running the new JS?" finally has a visible answer, and
  the two cases imply different fixes — so the next report can be acted on
  without guessing.

### Verified

- Ten harness scenarios, 0 failures: healthy tree (47), `ui.menu.load()`
  throwing synchronously (51), hanging (53), **module never loaded — watchdog
  produces a usable menu and marks it `#core` (54)**, requestpath matching no
  root child (47), rejecting (51), empty tree (51), no `ui.menu` class (51),
  15-port bridge (50), simulated FTTR ONU (39). Each fallback case asserts the
  note carries the right build marker.

## 3.10.7 — 2026-11-04

### Fixed

- **A synchronous throw inside `ui.menu.load()` blanked the sidebar with no
  message at all.** This is what the stripped ONT build (OpenWrt 0.8.4-beta,
  Tianyi TYFZA1) hit: the throw happened while the module was being
  instantiated, so `L.require('menu-lucent')` rejected and **not one line of
  the fallback logic ran** — no menu, no note, nothing. Every entry point is
  now guarded:
  - `__init` wraps `build()` in try/catch and renders the built-in menu on
    error, recording the reason;
  - `render(tree)` is wrapped too, so a throwing tree cannot skip the fallback;
  - `withTimeout()` accepts non-promises (`Promise.resolve()`), because a
    forked `ui.menu` may return a plain object;
  - every `L.env.dispatchpath` / `L.env.requestpath` read goes through
    `pathOf()`, since those can be undefined on minimal builds.
- **The built-in menu died with the module that carried it.** It lived inside
  `menu-lucent.js`, so if that file could not be loaded the sidebar had nothing
  left but an apology. The table and renderer moved to `lucent.util.js`
  (`util.builtinMenu(ul, {reason, onRetry})`) and are now drawn by two callers:
  the menu builder, and a new independent watchdog in `core.js`.
- **`core.js` gained that watchdog** (`watchMenu`), which runs even when
  menu-lucent never loads: at 7 s it re-requests the module and calls `build()`
  if the nav is still empty; at 16 s it renders the built-in menu itself with
  the reason and a Retry that reloads the page. The sidebar can no longer be a
  silent empty column.

### Verified

- Ten harness scenarios, 0 failures: healthy tree (47), `ui.menu.load()`
  rejecting (50), **throwing synchronously (50 — the ONT case; asserts the
  built-in menu and its reason appear)**, hanging forever (52), requestpath
  matching no root child (47), empty tree (50), no `ui.menu` class (50),
  **menu module never loaded at all (53 — asserts the watchdog produces a
  usable menu: ≥3 groups, a note and a retry)**, 15-port bridge (50) and the
  simulated FTTR ONU (39).
- 0 untranslated strings after regenerating `lucent.zh-cn.lmo`.

## 3.10.6 — 2026-11-04

### Fixed

- **The sidebar could still render no menu at all when the tree was fine.**
  The menu is built from the root child whose name equals `requestpath[0]` —
  the same rule upstream uses. On builds where that does not match (forked
  luci-base, an empty request path), nothing matched and the sidebar stayed
  empty even though the menu tree had loaded. The builder now falls back to
  the first root child that actually has entries, and records the mismatch
  (`requestpath=… roots=…`) for the note.
- **The LAN tree buried the useful rows.** On an FTTR ONU the bridge reports
  22 members, 21 of them unconnected, and the forwarding table cannot place
  most hosts — so the card was a wall of `空闲` rows above a flat list of
  unknown MACs. The tree now classifies members: a port is shown when it has
  attached hosts, is linked up, or reports a speed; everything else collapses
  into one "Idle ports" row that expands on tap. Hosts per branch are capped
  at 6 with a "N more devices" row, and 22 ports + 15 hosts now render as
  ~12 rows instead of ~37.
- **Rows carried filler text.** `无地址` and a bare `–` rate took space on
  every host without an address or traffic; both are omitted now (the rate
  slot still exists so a later poll can fill it).

### Added

- Softer list interaction, as asked: roomier rows (38 px, 12 px radius, wider
  gaps), a gentle hover that shifts the row, tints it and lifts a faint accent
  shadow, icon chips that fade colour with it, a short entrance for newly
  revealed rows, and dimmed down-ports that return to full opacity on hover.

### Verified

- Eight harness scenarios, 0 failures: healthy tree (47 checks), `ui.menu.load()`
  rejecting (50), hanging (52), **requestpath matching no root child (47 — the
  menu now renders anyway)**, empty tree (50), no `ui.menu` class (50),
  15-port bridge (50 — 8 rows + toggle, 15 after expanding), and a **simulated
  FTTR ONU: 22 unconnected ports + 15 unplaceable hosts (39 checks — asserts
  zero port rows, exactly two summary rows, ≤12 total rows, 6 leaves before
  the toggle and 15 after)**.
- Screenshots of both the ONU-shaped tree and a normal tree at 1280 px.

## 3.10.5 — 2026-11-04

### Fixed

- **On phones the menu was pushed out of the drawer.** The live status panel
  added in 3.9.0 kept its desktop height inside the drawer, so at 500 px the
  navigation got only 233 px of the viewport — roughly six of eight entries
  visible and the rest behind an easy-to-miss internal scroll. It read as
  "the sidebar menu is missing", because the entries you wanted were below the
  fold while a status panel you did not ask for held half the screen.
  - The panel now **starts collapsed on viewports ≤980 px**: one row with the
    live dot, the clock, refresh and an expand button. Tap it when you want
    the readings; the menu owns the space otherwise. An explicit choice
    (stored in `localStorage`) always wins, on phones too.
  - The drawer gives the navigation at least 45% of the viewport height
    (`min-height:45vh`) and caps the panel at 34%, and the menu scroll no
    longer chains to the page (`overscroll-behavior:contain`).
  - Measured effect at 500×900: navigation 233 px → **575 px**, panel
    386 px → 44 px.

### Added

- The harness now **measures painted geometry instead of only counting DOM
  nodes** — this is the check that was missing since 3.9.0 and the reason the
  problem took five releases to find. Four new assertions per run: the nav has
  real height (≥40% of the viewport, min 220 px), the first menu item is
  actually painted (`height > 20px`, `opacity:1`), the panel stays under 45%
  of the drawer on phones, it starts collapsed there, and every top-level item
  is reachable within the nav's own scroll coordinates.

### Verified

- 47 checks pass at 1600×1000, 500×900 with the drawer open, 390×780 with the
  drawer open, and 1600×1000 in the collapsed rail.
- Screenshot at 390 px confirms the full menu (Home, Devices, Status, Network,
  Services, VPN, System with its four children, Logout) with the panel
  reduced to a single row at the bottom.

## 3.10.4 — 2026-11-04

### Fixed

- **A menu request that never answers left the sidebar blank forever.** The
  fallback added in 3.10.2 only ran when a source *rejected*; a hanging one
  never settles, so neither the live menu nor the fallback was ever drawn —
  which is what the mobile drawer showed while the desktop was fine. Every
  source now has a deadline (`ui.menu.load()` 4 s, the raw `admin/menu`
  request 6 s); on expiry the builder moves to the next source and ultimately
  to the built-in menu, with the reason line reading e.g.
  `ui.menu: ui.menu.load() → timed out 4000ms`. The last-resort rebuild fires
  once at 12 s instead of re-running every few seconds.
- **The topology could attach the tree to the wrong bridge.** The helper
  picked the first `/sys/class/net/*/brif` it found, so on boxes with several
  bridges (ONUs, DSA boards) the tree described an unrelated bridge. It now
  prefers `br-lan`, then the bridge that actually carries `network.lan`, and
  only then any bridge.
- **A wall of `unknown` rows.** `operstate` is unreadable for many virtual
  members; that used to be reported as the literal string `unknown` and the
  frontend printed it as the row's only content. The helper now omits the
  field instead of inventing a value, and the tree skips it.
- **Long port lists flooded the card.** The tree renders the first 12 members
  and offers a "N more ports" row that expands the rest in place.

### Added

- `day_traffic` helper method: today's down/up totals from the WAN counters,
  with the daily baseline kept in `/tmp` and reset on date change (a
  reconnect that zeroes the kernel counters clamps to zero instead of
  reporting a huge number). The dashboard surface for it lands next.

### Verified

- Six harness scenarios, each a full page run: healthy menu (42 checks),
  `ui.menu.load()` rejecting (45), **hanging forever (47 — asserts the
  deadline fires and a menu still appears)**, an empty tree (45), no `ui.menu`
  class at all (45), and a 15-port bridge (45 — asserts exactly 12 rendered,
  the toggle present, and 15 after clicking it). 0 failures in all six.
- `sh -n` clean on the rpcd helper; all touched JS modules parse.
- Port cap and tree rendering checked in a browser screenshot.

## 3.10.3 — 2026-11-04

### Fixed

- **`install.sh check` could exit silently, printing nothing.** The script runs
  under `set -e`, and the new `VIA=$(cat "$TMP/latest-via")` line — plus the
  `/usr/share/lucent/version` read in `get_current` — returned non-zero when
  those files did not exist. The script then aborted *before* printing its
  JSON, so a failed update check looked like "can't fetch a new version" with
  no reason anywhere. Both reads are now guarded with `|| true`.
- **A stale `@main` copy of the script could still not see the newest
  release.** `resolve_latest()` now has three independent sources instead of
  two, ordered so that a network which can reach jsDelivr but not GitHub (or
  the reverse) still resolves a version:
  1. `data.jsdelivr.com/v1/package/gh/<repo>` — the version index, first entry
     is the newest published tag; it is an API, not a cached repo file;
  2. `api.github.com/repos/<repo>/releases/latest` → `tag_name`;
  3. `github.com/<repo>/releases/latest` → 302 `Location`.
  With `LUCENT_CN=1` the GitHub redirect is preferred over the API.
- **`sed` pattern bug in the JSON reader:** `\[?` was used as if it were an
  optional quantifier, but in GNU sed BRE a bare `?` is a literal, so the
  jsDelivr index never parsed. `json_field()` now strips brackets along with
  whitespace, which makes `"versions":["x"` and `"tag_name":"x"` the same
  shape for one pattern.
- **The check result now says where the version came from**: the JSON gained
  `"via":"jsdelivr-index|gh-api|gh-redirect|pointer-file|base-url"`, so a wrong
  "already up to date" can be traced to its source instead of guessed at.

### Verified

`sh install.sh check` against the live repo, with hosts blocked selectively
through a `curl` shim:

| scenario | result |
| --- | --- |
| everything reachable | `latest: 3.10.2-r1`, `via: jsdelivr-index` |
| jsDelivr blocked | `via: gh-api` |
| all GitHub hosts blocked | `via: jsdelivr-index` |
| private `LUCENT_BASE_URL` mirror | `via: base-url` |
| nothing reachable | `{"latest":"","available":false,"error":"no-source"}` — prints, does not abort |
| installed 3.7.6 / 3.9.0 | `available: true` (numeric compare, not lexical) |
| installed 3.10.2 | `available: false` |

## 3.10.2 — 2026-11-03

### Fixed

- **The sidebar menu could still be blank.** 3.9.0 removed the dependency on
  `luci-theme-bootstrap`, but the theme then relied on a single source for the
  menu tree — `ui.menu.load()`. When that one call fails (session storage
  blocked, a forked luci-base, a cached empty tree, a menu endpoint that
  errors) the sidebar rendered nothing at all.
  - The builder now tries three sources in order: `ui.menu.load()`, then the
    raw `admin/menu` endpoint over XHR, and only then the built-in menu.
  - The built-in menu is a real navigation tree — Home, Devices, Status,
    Network, System, Appearance, Logout with their stock sub-paths — rendered
    with the same markup as the live menu, so icons, the accordion, the mobile
    drawer and the command palette all keep working.
  - When the fallback is used the sidebar **says why**: a note at the top of
    the menu carries the failing step and the error (e.g.
    `ui.menu: …; /cgi-bin/luci/admin/menu → HTTP 404`) plus a **Retry** button
    that flushes LuCI's menu cache and session storage before rebuilding.
  - A retry is also scheduled once after 4 s in case another module raced the
    build and left `#topmenu` empty.
  - Rebuilding clears `#topmenu`, `#modemenu` and `#tabmenu` first, so a retry
    cannot stack duplicate menus.

### Verified

- Browser harness runs four menu scenarios via URL flags — healthy tree,
  `ui.menu.load()` rejecting, an empty tree, and no `ui.menu` class at all:
  42 checks pass in the healthy case and 45 in each failure case, asserting
  the sidebar is never empty, the note and Retry button appear, the built-in
  groups render, icons are injected on every link and the active page is still
  marked and its group expanded.
- Fallback rendering checked in a browser screenshot at 1600 px.
- All new strings translated; `lucent.zh-cn.lmo` regenerated (0 missing).

## 3.10.1 — 2026-11-03

### Fixed

- **The online installer could install an old version, and the in-app update
  check could report "already up to date" forever.** Both read
  `cdn.jsdelivr.net/gh/<repo>@main/…`, and jsDelivr caches `@main` files for
  **7 days** (`Cache-Control: public, max-age=604800`, verified with
  `X-Cache: HIT` and `Age: 23579`). A freshly released version was therefore
  invisible through that path: the piped `install.sh` was itself a stale copy
  whose baked `LUCENT_TAG_DEFAULT` pointed at an old release, and
  `latest*.txt` could name the previous version too.
  - `get_latest()` now asks GitHub's release endpoints first —
    `api.github.com/repos/<repo>/releases/latest` (`tag_name`), falling back to
    the `releases/latest` 302 `Location` — neither of which is behind that
    cache. The pointer files are only used to learn the exact `-rN` suffix
    when they agree with the tag, and jsDelivr/fastly pointer fetches now carry
    a `?cb=<epoch>` cache buster.
  - Plain `install.sh` no longer trusts its own baked default: when
    `LUCENT_VERSION` was not given, it resolves the newest release online and
    installs that instead, logging the substitution. So even an old copy of the
    script upgrades to the current version.
  - The tag's leading `v` is stripped before use, so asset URLs are built as
    `…/download/v3.10.1/…` rather than `…/vv3.10.1/…`.
- **README** now leads with
  `github.com/<repo>/releases/latest/download/lucent-install.sh` as the
  recommended one-liner — release assets are immutable per version and the
  `latest` redirect always resolves to the newest, so it cannot serve a stale
  script — and documents the jsDelivr cache caveat.

### Verified

- `sh install.sh check` against the live repo returns
  `{"current":"","latest":"3.10.0-r1","available":true}` — previously the
  pointer-only path could report the older release as latest.
- Private-mirror path (`LUCENT_BASE_URL=http://127.0.0.1:…`) still resolves the
  version from the served pointer file: `{"latest":"3.10.0-r1"}`.
- Fully offline (proxies pointed at a dead port) degrades to
  `{"current":"","latest":"","available":false,"error":"no-source"}` without
  hanging.
- `sh -n install.sh` clean; the published `lucent-install.sh` asset is a valid
  installer with correct baked defaults.

## 3.10.0 — 2026-11-03

### Added

- **Branching topology tree.** The network path card now draws the LAN as a
  tree instead of a straight line: bridge → each port → the hosts learned on
  that port. Wired ports come from the bridge FDB, wireless ones from the
  driver's association list, so a phone lands under the radio it actually
  associates with rather than in a flat list. Each port shows its negotiated
  speed and state (a down port is dimmed and its branch stops pulsing), each
  host leaf shows address and live rate, and every leaf links to the devices
  page. Hosts the FDB cannot place stay visible under an "Other links"
  branch, so the tree never silently drops a device.
- **Per-device realtime rates.** New `host_rates` helper method reads
  `/proc/net/nf_conntrack`, sums both tuples of every entry per inner IP and
  diffs the result against the previous snapshot in `/tmp`, which yields a
  real down/up rate **and** a last-seen age per host — no daemon, no firewall
  rules, no tc classifiers. It is driven by `lucent.main.acct`: when the
  option is on, the helper re-enables `nf_conntrack_acct` (the kernel clears
  it on reboot). Off by default because accounting costs a little CPU per
  connection.
- **Top talkers card** on the dashboard: the six heaviest hosts right now,
  with proportional bars that animate between polls and an age tag for hosts
  that have gone quiet. Only rendered when accounting is enabled.
- **Devices page gains a Rate column** (sortable, default ordering untouched)
  with down/up figures, a small load bar and the last-seen timestamp, plus an
  inline banner that explains the feature and can turn accounting on without
  leaving the page.
- **Appearance → Home page gains a "Per-device rates" switch**, with the cost
  stated honestly in the help text.

### Fixed

- **The right RPC for stations.** Current LuCI exposes the association list as
  the `iwinfo.assoclist` ubus method (`luci-rpc.getWirelessAssocList` is the
  legacy wrapper); the theme now tries `iwinfo` first and falls back, so the
  wireless branches work on both new and older builds.
- Wireless ports are labelled with their SSID by matching the netdev against
  several field names the wireless dump uses across builds (`ifname`, the
  object key, `section`), instead of assuming one shape.

### Changed

- The dashboard's structure fetch (topology + stations) runs with the view and
  refreshes every 6th poll; per-device rates refresh on every poll, since that
  is the part that moves.

### Verified

- Browser harness (`tests/harness.html`) now mocks `luci.lucent.topology`,
  `luci.lucent.host_rates` and `iwinfo.assoclist`: 42 assertions pass,
  including four bridge ports with the negotiated speed shown, a dimmed down
  port, SSIDs on both radios, the phone placed under its radio and the laptop
  under `lan1` via the FDB, unknown MACs still rendered, no catch-all needed
  when everything is placed, top talkers ordered heaviest-first with a 100 %
  bar, the devices table's seventh column populated, and the tree's rate cell
  changing between two poll rounds. Checked at 1600 px and 500 px.
- The rpcd helper's three awk programs are tested against realistic fixtures
  (`mock-check/test-helper-awk.js`): tuple direction and totals, rate deltas,
  silence age, the baseline handed to the next call, cold start without a
  baseline, and FDB mac/port extraction across `dev`/`destination` forms.
- Two real bugs came out of that harness run and are fixed above: the
  catch-all branch was computed before the ports placed their hosts (duplicate
  leaves), and the SSID lookup was handed the summarised wireless state
  instead of the raw dump.

## 3.9.0 — 2026-11-03

### Fixed

- **The sidebar could open completely empty.** The theme asked LuCI to load
  `menu-bootstrap`, but that module ships with **luci-theme-bootstrap**, not
  with luci-base. On images where the bootstrap theme is not installed the
  require rejects, `#topmenu` is never filled and the sidebar is a blank
  column with no navigation. Lucent now builds its own menu
  (`resources/menu-lucent.js`) from the same ACL-filtered tree —
  top level, submenus, mode menu and tab menu — and only falls back to
  `menu-bootstrap` if that ever fails. If the tree itself cannot be fetched
  (or the account sees no nodes), the sidebar says so and keeps the entries
  this package guarantees instead of showing nothing.

### Added

- **Live status panel in the sidebar** (`resources/lucent/sideinfo.js`), so
  the readings that used to exist only on `/admin/home` are visible on every
  page, in the drawer too:
  - animated CPU and memory rings, each linking to the dashboard and
    carrying cores / temperature / used-of-total in its tooltip;
  - a live WAN throughput curve with down and up rates, sampled every 5 s
    and smoothed by a `d` transition;
  - rows for WAN, LAN, uptime, online devices, Wi-Fi (radio count + first
    SSID) and temperature, with WAN, devices and Wi-Fi clickable;
  - a storage meter with an animated bar that turns red above 90 %, and a
    tag strip for load, conntrack and process counts;
  - a ticking clock, a refresh button and a collapse toggle whose state
    persists in `localStorage`.
  Calls are tiered so the panel stays cheap: counters every 5 s, the
  interface dump every 3rd round, leases and host hints every 6th, wireless
  and storage every 12th. Hidden tabs skip their tick.
- **Motion**: conic rings now interpolate (a registered `--val` custom
  property — the dashboard rings animate too), shimmering skeleton
  placeholders until the first reading lands, a flash on values that
  actually change, a pulsing live dot, and drawer entries that stagger in
  behind the panel instead of appearing all at once. Everything is gated by
  `prefers-reduced-motion`.
- **Collapsed rail keeps the two rings** (CPU and memory) and drops the rest,
  so the 64 px sidebar still tells you how the box is doing.
- **Short windows drop the tag strip** rather than cutting a row in half.

### Verified

- Browser harness (`tests/harness.html`), now rendering the real sidebar with
  a mocked menu tree: 25 assertions pass at 1600×1000, plus rail mode, the
  500 px drawer and a 720 px-tall window. Covers 8 top-level entries, 5
  submenu groups, icon injection, active marking, a nested page opening only
  its own group, every panel reading, the drawn curve, cleared skeletons and
  two dashboard poll rounds.
- The harness caught a collision on the way: the panel's curve originally
  carried `.ltc-spark`, which the home view queries document-wide, so the
  dashboard sparkline threw. The panel now uses its own `ltc-si-curve`.

## 3.8.1 — 2026-11-03

### Added

- **Traffic trend time axis**: samples now carry their timestamp, so the
  chart footer shows relative ticks (`now`, `-30s`, `-5m`, `-1h` …) instead
  of a bare curve, and hovering the plot reveals the exact rate and age of
  the nearest sample.
- **Path summary strip**: the network path card grows a bottom row with
  current traffic, how long the uplink has been connected, the number of
  active networks and the busiest network by combined down/up rate.
- **Per-core CPU bars**: the health card reads the new `cpus` array from
  the `overview` helper (busy % per core, diffed from `/proc/stat` and
  persisted between polls) and renders one bar per core.
- **Memory split bar**: memory is drawn as used / cache / free segments
  with a legend, replacing the single "used" figure.

### Verified

- Browser harness (`tests/harness.html`, two simulated poll rounds):
  4 core bars, memory split percentages, relative ticks and the summary
  strip all populate without runtime errors.

## 3.8.0 — 2026-11-02

### Added

- **Network path card** on the home page (replaces the small icon strip,
  still governed by the topology toggle): Internet → this device → LAN/WiFi
  as clickable node cards — WAN IP + DNS, hostname + LAN address/mask +
  uptime + memory, SSID + device count — joined by links carrying live
  down/up rates (WAN link and LAN bridge link, refreshed every poll).
- **Devices page upgrades**:
  - device-class chips (phone / TV / camera / computer / printer / wearable
    / smart / network) guessed from the advertised hostname, each with its
    own colour and tooltip;
  - a **Connections** column fed by `luci-rpc.getConnsPerHost` (added to
    the theme ACL);
  - sortable table heads (name, IPv4, connections, status) with direction
    indicator; sorting keeps the active filter.

### Verified

- Harness run: path card (3 nodes + live links), client chips, connection
  counts and sorting all render without runtime errors.

## 3.7.7 — 2026-11-02

### Fixed

- **Rail flyouts could hang open permanently.** A group left `.open` by an
  earlier accordion click had its submenu `display:block` rule beat the
  rail-mode hide rule, so panels stayed stacked over the page with the
  mouse nowhere near. `.open` groups now stay hidden until actually
  hovered/focused.
- **Open dropdowns slipped under the sticky save bar.** Cards create a
  stacking context via `backdrop-filter`, so a dropdown's high z-index was
  trapped inside the card while the sticky action bar (z-index 20) drew over
  it. The host card/value now lifts above the bar while a dropdown is open
  (`:has()`).

### Changed

- **Auto-collapse removed.** The rail only activates when you click the
  chevron button (persisted per browser). Window width no longer decides it,
  so mid-size desktop windows get the normal sidebar by default.

## 3.7.6 — 2026-11-02

### Fixed

- **Stale cached theme.css could survive upgrades.** When the version marker
  (`/usr/share/lucent/version`) was missing — typical for older file-copy
  installs — the stylesheet cache buster fell back to the constant `3`, so
  every upgrade reused the same URL and browsers kept rendering old CSS:
  unstyled dashboards and a giant unclipped trend triangle (as seen on the
  XPON device). The buster now falls back to the theme.css mtime, then the
  LuCI version, so it always changes after an upgrade.
- **Trend chart size is now inline-styled**, so even a stale stylesheet
  cannot blow the SVG up to full-page size.
- **Rail flyout could hang open forever.** Clicking a group header kept
  keyboard focus (`:focus-within`), pinning the submenu panel after the
  mouse left. Clicked headers/items now blur, so the panel follows the
  pointer again.

## 3.7.5 — 2026-11-02

### Added

- **Two new palettes**: Ocean (sea teal) and Sakura (cherry pink), each with
  light and dark readings — seven colour families in total, now ordered with
  Mist first as the recommended light-glass default.
- **Chinese palette names** across the appearance picker: 雾蓝 / 海青 / 青瓷 /
  樱粉 / 暮紫 / 陶棕 / 石墨.
- **Dashboard cards can be turned off** individually under Appearance → Home
  page: traffic trend card, network topology, update banner.
- **More motion**: KPI numbers count up/down smoothly when they change
  (memory, storage, devices); a light packet flows along active topology
  links; cards lift gently on hover; buttons and quick actions squash on
  press; the trend line breathes. All of it stays disabled under
  prefers-reduced-motion.

### Note

- Existing installs keep their saved palette because `/etc/config/lucent` is
  a conffile (upgrades never overwrite user settings). Switch to Mist (雾蓝)
  once in Appearance, or run
  `uci set lucent.main.palette=mist && uci commit lucent`.

## 3.7.4 — 2026-11-02

### Fixed

- **Mobile layout was wrecked by the icon rail (regression from 3.6.9).**
  The "auto-collapse below 1200px" rule also fired on phones: `font-size:0`
  hid menu labels, the grid was forced to 64px + content, submenu flyouts
  covered the page, and the sidebar collapsed into a sliver. Rail mode is
  now hard-gated to viewports ≥981px in both the CSS (all `[data-rail]`
  rules wrapped in a media query) and the bootstrap script, so phones always
  get the drawer layout. Verified at 500px with rail forced on.

## 3.7.3 — 2026-11-02

### Fixed

- **Lone card left a 40% gap on wide screens.** The ≥1280px two-column grid
  rule also applied to rows holding a single card (the system card, now that
  updates moved to the top banner); lone cards span the full row again.

### Verified

- Release checked with an end-to-end runtime harness (real home.js,
  clients.js, core.js, util.js and theme.css rendered against mocked ubus
  data in a browser at mobile and desktop widths): update banner, lease
  countdown `(v6)` fallback, gateway/DNS/WAN fields, rings, devices table and
  clients auto-refresh all render without errors.

## 3.7.2 — 2026-11-02

### Fixed

- **In-page updates could fail midway.** The update job ran
  `/usr/share/lucent/install.sh` directly while the package install
  overwrote that same file — busybox sh reads scripts incrementally, so the
  tail of the run executed whatever the new file contained. Both update and
  check jobs now snapshot the installer to /tmp first.

### Changed

- **Update status moved to the top of the dashboard** as a full-width banner
  right below the greeting: installed version, state, action buttons and an
  **animated progress bar** (indeterminate while running, green on success,
  red on failure, with the last log line alongside).

### Added

- Upgradable **system package count** badge in the update banner (cached
  server-side for one hour, refreshed by a detached `apk/opkg` job).
- Appearance → Maintenance: **China mirrors first** switch (`update_cn`), so
  users behind the GFW can flip one toggle instead of editing uci by hand;
  check and update jobs honour it.
- Devices page now **auto-refreshes every 15 seconds**, preserving the
  active filter text.
- Traffic card gains a **today peak** tag persisted per day in localStorage
  (survives reloads, unlike the in-tab sample history).
- The sidebar theme button cycles **Auto → Light → Dark → Auto** and shows
  the current mode in its tooltip.

## 3.7.1 — 2026-11-02

### Fixed

- **Traffic trend chart rendered blank on real devices.** LuCI's `E()` DOM
  helper creates elements in the HTML namespace only (verified against both
  23.05 and master sources — core views use `<img>` icons for this reason);
  the sparkline's `E('svg')/E('path')/E('defs')` nodes therefore never drew.
  SVG nodes are now built with `document.createElementNS`.

### Changed

- **Default palette is now Mist** (soft blue glass) instead of Clay (brown)
  for fresh installs; existing devices keep their choice, and Appearance →
  Restore defaults now also lands on Mist.

### Added

- Richer motion: gradient-filled mountain areas with a soft drop shadow,
  smooth curve morphing between samples (`transition: d`), health rings that
  sweep to their new value (`@property --val` transition), and a brief
  highlight flash whenever a live value changes.
- Restoring defaults now also removes the daily-wallpaper cron entry.

## 3.7.0 — 2026-11-02

### Added

- **Daily auto wallpaper.** A new switch under Appearance → Online wallpapers
  installs a 06:00 cron job that downloads the Bing image of the day,
  replaces the previous auto image and points the background at it
  (`/usr/share/lucent/wallpaper.sh`, gated by `lucent.main.wallpaper_auto`).
  Turning it off removes the cron entry again.
- **Traffic trend card on the home page.** A mountain-area sparkline of the
  downlink/uplink rates sampled by the 10-second poll, with a pulsing
  endpoint, current-rate badge and peak-down / peak-up / sample-count tags.
  The sample history lives in sessionStorage, so the curve survives page
  navigation within the tab (up to 120 points).
- **Entrance animation.** Dashboard sections now rise and fade in with a
  staggered delay (fully suppressed under prefers-reduced-motion).

## 3.6.9 — 2026-11-02

### Fixed / Added

- **Lease remaining was "–" for PPPoE uplinks.** PPPoE assigns its IPv4
  address without a DHCP lease, so there was nothing to count down. The
  field now falls back to the DHCPv6 upstream (`wan6` address or prefix
  validity, shown with a `(v6)` suffix), matching what the native status
  page displays as 剩余有效期.
- **Sidebar now auto-collapses.** On load, widths below 1200px start in the
  icon rail unless the user has toggled it manually (that choice still wins
  and persists).
- **Rail mode is usable.** Group submenus now fly out beside the collapsed
  rail on hover/focus instead of being hidden entirely.

## 3.6.8 — 2026-11-02

### Added

- **Home network card now mirrors the status-page uplink details.** Three more
  fields, all read from the existing `network.interface` dump at no extra
  cost: WAN device (e.g. `pppoe-wan`), WAN connected time (`uptime`) and DHCP
  lease remaining (`ipv4-address[].valid`); the last two refresh with the
  10-second poll.

## 3.6.7 — 2026-11-02

### Fixed

- **Status → Overview uplink cards looked unstyled.** Modern LuCI renders the
  IPv4/IPv6 upstream boxes as full cards inside `.network-status-table`, while
  the theme only styled the old pill-shaped `.ifacebox`. Added scoped card
  styling (tinted header, active accent, roomy body, visible progressbar
  track) without touching the small pills used on the interface pages.

## 3.6.6 — 2026-11-02

### Fixed

- **theme.css was cached forever after upgrades.** The stylesheet URL was
  pinned to `?v=3.6.2`, so browsers reused stale CSS across updates and new
  styling never appeared without a hard reload. The cache-buster now carries
  the installed version read from `/usr/share/lucent/version`.
- **Menu icons missed leaf entries.** LuCI gives `a.menu` only to group
  headers; plain links (Home, Devices, Logout) have no class. All top-level
  anchors are now decorated, group headers resolve their icon via the first
  child link, unknown entries fall back to a generic glyph, and each link
  gets a tooltip with its label.
- **CPU temperature showed "–" on SoCs that report millidegrees.** Thermal
  zone values like `46000` failed the sanity window and were discarded;
  values ≥ 1000 are now normalised from millidegrees before comparison.
  (Devices with no thermal sensor at all still show "–" — there is nothing
  to read.)

### Added

- **Collapsible sidebar.** A chevron button in the sidebar footer collapses
  the rail to icons-only (64px); the state persists in localStorage and is
  applied before first paint, so there is no flash on load. Hidden on
  phones, where the drawer already covers this.

## 3.6.5 — 2026-11-02

### Added

- **Sidebar menu icons.** Top-level navigation entries (Home, Devices, Status,
  System, Network, Services, VPN, Logout) now get a small stroke SVG glyph,
  injected once LuCI's menu is built and kept idempotent across menu updates.

### Fixed

- **DHCP lease remaining time was wrong.** dnsmasq/odhcpd report `expires` as
  an absolute epoch, but the theme formatted it as a raw duration, so lease
  columns showed absurd values (years) and expired leases counted as active.
  Remaining time and online state are now computed against the current clock.
- **Hardcoded "Lucent 3.6" strings** in the page footer and the Appearance
  header now read the installed version (`/usr/share/lucent/version`, falling
  back to the overview RPC on the Appearance page), so they never go stale.

## 3.6.4 — 2026-11-02

### Fixed

- **Sidebar brand logo could vanish entirely.** When `lucent.main.logo_image`
  points at a media file that no longer exists (deleted from the media library,
  or lost after a firmware/overlay reset), the brand `<img>` rendered as a
  broken image with no fallback, leaving the sidebar header blank. The image
  now falls back to the bundled `logo.svg` on load errors, and removes itself
  if even that fails, so the default brand mark area is never a dead gap.

## 3.6.3 — 2026-11-02

### Fixed

- **Gateway and DNS cards were always empty on OpenWrt 22.03+.** netifd dumps
  the default route's next hop as `route[].nexthop` (not `gateway`) and lists
  resolver addresses under `dns-server` (not `dns-servers`/`dnsserver`). Both
  shapes are now normalised, so gateway, DNS and the live 10s refresh work on
  old and new releases alike.
- **The update check could hang the dashboard.** `theme_check` used to run
  `install.sh check` synchronously inside rpcd — up to four mirrors × 8s each,
  blocking every other RPC. The probe now runs detached with a cached result
  (15 min on success, 60 s on failure) and answers `{current, checking}`
  instantly; the dashboard polls until a fresh verdict lands.
- **SDK / feed builds shipped without the updater helper.** luci.mk only packs
  luasrc/ucode/htdocs/root/src, so `install.sh`, the version marker and the
  bundled `.lmo` catalogs were missing from source-built packages. A
  `Build/Prepare/luci-theme-lucent` hook now injects all three.
- **Dashboard rows were ragged on desktop.** Cards in the same row now stretch
  to equal height, health rings centre, tags/lists/buttons pin to the card
  bottom, KPI captions align, and wide screens (≥1280px) give the content
  column a 1.55:1 share so the right-hand cards stop trailing large blanks.

### Added

- The dashboard now auto-checks for updates shortly after load and shows the
  installed version immediately from the local package database — no button
  press needed; the manual "Check for updates" button remains.
- New live metrics: cumulative WAN traffic, DHCP lease count, multi-SSID WiFi
  summary, available memory (buffer/cache aware), CPU cores, CPU temperature
  (thermal_zone/hwmon), running/total processes and conntrack usage.
- `scripts/po2lmo.js`: a Node port of upstream po2lmo used to regenerate the
  Simplified Chinese catalog byte-for-byte (validated against the shipped
  file); new UI strings are translated.

## 3.6.2 — 2026-11-01

### Fixed

- **Mobile dashboard layout was cramped.** On phones the network/system detail
  items and the KPI stat tiles could render as 3–4 narrow columns, so long
  values wrapped awkwardly. Up to 600px wide these now use a clean two-column
  layout; the main cards already collapse to a single column on phones.
- **In-page updater could not detect the current version or new releases.**
  - The installed version is now also recorded in a marker file
    (`/usr/share/lucent/version`, shipped inside every package and written by
    both installers), so file-copy installs — which leave no apk/opkg record —
    still report the current version instead of blank.
  - The "check for updates" step now reads a version-agnostic `latest`
    pointer from the repository tree (raw GitHub / jsDelivr, with the same
    China-mirror fallback) and falls back to GitHub `releases/latest`, so an
    older installed build can still discover the newest release.

## 3.6.1 — 2026-11-01

### Fixed

- **Sidebar submenus were all expanded at once.** Groups are now collapsed by
  default; only the group containing the current page is auto-expanded, and a
  group header toggles its own submenu open/closed (accordion behaviour).
- **Real-time traffic on the dashboard always showed "–".** The interface
  `dump` does not carry byte counters on this build, so throughput is now
  computed from `luci-rpc.getNetworkDevices` device statistics (the interface's
  L3 device), and updates every poll.

## 3.6.0 — 2026-11-01

### Added

- **In-page online update.** The dashboard now has an **Updates** card: press
  *Check for updates* to compare the installed version against the latest
  release on GitHub (with the same China-mirror fallback as the installer),
  and *Update to vX* to download and install it in the background with live
  progress. On success the page reloads automatically.
- The installer gains `check` (prints JSON) and `update` actions, and ships
  inside the package at `/usr/share/lucent/install.sh` so the button can call
  it. The browser only ever triggers a fixed action — it never supplies a URL,
  version or command.
- Optional mirror override for the updater, settable only by root:
  `uci set lucent.main.update_url=http://host/dir` and
  `uci set lucent.main.update_cn=1` (prefer mirrors).

## 3.5.0 — 2026-11-01

### Fixed

- **Saving Appearance settings raised "RPC call to uci/commit failed with
  error -32002: Access denied".** The theme's rpcd ACL granted the `lucent`
  config but not the `uci` *methods*, so `uci/commit` (and the `uci/get` used
  to read the panel) were denied. The ACL now grants `commit`/`set`/`options`
  on write and `get`/`order`/`changes`/`revert` on read, so theme settings
  persist without a modal.
- **Appearance reloaded to defaults instead of the saved values.** With the
  read ACL fixed, reopening the panel now shows the stored palette, mode and
  toggles rather than resetting them.
- **"Save & Apply" label was invisible until hover.** The ComboButton
  (`div.cbi-dropdown.cbi-button-apply`) inherited the light card background
  while keeping white accent text. It now keeps the accent fill with
  `--on-accent` text, and plain dropdowns pin `color:var(--text)` so no
  control renders white-on-white text.

### Added

- **A much richer dashboard.** New Storage KPI, a full-width System card
  (hostname, model, architecture, kernel, firmware, live local time, active
  interfaces, memory, swap, storage, load), plus Gateway, DNS and WAN IPv6
  facts on the network card.
- **Daily greeting line.** The hero shows a line of the day fetched from
  `v1.hitokoto.cn`, cached per date in `localStorage` and rendered with
  `textContent` (remote strings can never inject markup). With no internet it
  falls back to a built-in, day-indexed line. Toggle it in
  Appearance → Home page.
- **`storage` method on the `luci.lucent` helper.** This LuCI build does not
  expose `luci-rpc.getStorageJSON`, so the theme now reports root/overlay
  free and total space itself.

## 3.4.0 — 2026-11-01

### Fixed

- **Home "Software" quick action returned 404.** It now links to the real
  `admin/system/package-manager` route instead of the non-existent
  `admin/system/software`.
- **Loading animation rotated its own label.** The `.spinning` indicator now
  draws the ring as a `::before` pseudo-element, so "Loading view…" (and busy
  buttons / directory loaders) keep their text upright while only the dot
  spins.
- **Home network topology clipped at tablet widths.** The Internet → WAN →
  Router → LAN → WiFi row now shares the card width (`flex:1 1 0`) with a
  fluid icon size, so the WiFi node is no longer cut off around 768 px.
- **Native tooltips were always visible and overlapping.** Interfaces and
  other CBI pages showed the `Type / Device / Connected / MAC / RX / TX`
  badges inline, cluttering the network diagram. `.cbi-tooltip` is now a
  proper hover popup (hidden by default, revealed on `.cbi-tooltip-container`
  hover), which also fixes the global `data-tooltip` popups.
- **Header indicators were unstyled.** `#indicators` now targets the real
  `span[data-indicator]` markup, with an active spinner, muted inactive state
  and clickable hover.

### Changed

- Quick actions are now resilient: the Wireless shortcut is only shown when
  the device reports at least one radio, so wired-only routers no longer get
  a dead link.
- Node label sizing no longer depends on an undefined container query unit.

## 3.3.0 — 2026-11-01

### Changed

- **The one-key script now pulls online from GitHub.** `install.sh` (also
  published as `lucent-install.sh`) downloads the matching `.apk` / `.ipk`
  from GitHub Releases at install time instead of embedding the whole
  package, so a single `wget … | sh` line is enough.
- **China mirror support built in.** If the direct GitHub download fails (or
  when `LUCENT_CN=1` is set), the script automatically retries through
  GitHub proxies (`ghfast.top`, `gh-proxy.com`, `mirror.ghproxy.com`,
  `github.moeyy.xyz`). The script itself can be fetched via jsDelivr.
- `LUCENT_BASE_URL` lets you point the installer at a private/intranet
  mirror; `LUCENT_VERSION` / `LUCENT_TAG` override the release coordinates.

### Added

- `scripts/offline-install.sh` keeps the previous no-network file-copy
  installer, and `lucent-offline-install.sh` (self-contained, embeds the
  packages) is still produced for routers without internet access.

## 3.2.0 — 2026-11-01

### Added

- The one-key script now supports `install`, `uninstall`, `status` and
  `--help`; running it without an argument remains a compatible shortcut for
  `install`.
- `install` checks for OpenWrt's LuCI web interface and attempts to install
  `luci` or `luci-base` from the router's configured package feed when LuCI
  is absent. Installing the bundled theme itself still does not require
  network access.
- `uninstall` removes the package or manually installed files, deletes the
  theme media and bundled Chinese catalogs, restores Bootstrap when Lucent
  is active, removes `/etc/config/lucent`, clears caches and reloads
  `rpcd`/`uhttpd`.

### Changed

- Package version and UI footer/cache-bust strings updated to 3.2.0.
- Added Simplified Chinese screenshots to `docs/screenshots/` and linked them
  from the README.

## 3.1.0 — 2026-10-31

Localization, quick navigation and a self-contained installer.

### Added

- **Simplified Chinese UI.** The theme ships its own `zh_Hans` catalog
  (`lucent.zh-cn.lmo`), registers `zh_cn` in `/etc/config/luci`, and
  translates backend error messages returned by `luci.lucent`.
- **Bundled LuCI Chinese catalogs.** `luci-zh-base` and `luci-zh-firewall`
  (unmodified translation data from the OpenWrt 25.12.6 package feed) are
  installed under distinct names, so menus and built-in pages are Chinese
  even on images without `luci-i18n-*` language packs.
- **Command palette.** `Ctrl/Cmd+K`, `/` or the toolbar search button opens
  a keyboard-navigable menu search overlay.
- **Live WAN throughput** KPI and Wi-Fi SSID on the dashboard, derived from
  `wan.statistics` and the first configured radio.
- **One-command installer** (`lucent-onekey-install.sh`): a single
  self-contained file that embeds the APK, IPK and file tree, needs no
  network, uses `apk`/`opkg` when available and falls back to copying the
  file tree. Base64 payload decoding falls back to ucode's `b64dec()` on
  images that do not ship `base64`.

### Fixed

- Installer no longer prints a CIDR suffix in the final URL
  (`192.168.1.1/24` → `192.168.1.1`).
- Installer verifies the decoded archive before extracting it.

## 3.0.0 — 2026-10-31

First release. Lucent 3 is an independent, clean-room LuCI theme for
OpenWrt 25.12 (ucode LuCI); it does not contain code from other themes.

### Added

- **Templates** (`header.ut`, `footer.ut`, `sysauth.ut`) implementing the
  LuCI theme contract: `#topmenu`, `#modemenu`, `#tabmenu`, mobile
  navigation, breadcrumbs and the login screen.
- **Design system** with the `ltc-` namespace and five palettes (Clay,
  Celadon, Mist, Dusk, Graphite), light/dark/auto modes, configurable
  glass blur, surface alpha and wallpaper dimming, and cozy/compact
  density.
- **Dashboard** (`/admin/home`): greeting, firmware/model, WAN and LAN
  addresses, uptime and memory KPIs with polling, uplink topology,
  memory/swap/load rings, device preview and quick actions.
- **Devices view** (`/admin/clients`): DHCP leases merged with ARP,
  neighbour and IPv6 hints, search, online state and lease time.
- **Appearance panel** (`/admin/lucent/settings`): live palette/mode/glass
  controls, background image or video, custom logo, and a media library.
- **Media backend** (`luci.lucent` rpcd helper): chunked uploads with
  magic-byte validation, size limits, media listing/removal, and online
  wallpapers from Bing, Unsplash and Wallhaven.
- **Optional add-on installer** driven by a fixed allow-list of eight
  LuCI application keys; package names never come from the browser.
- **Packaging**: OpenWrt 25.12 `apk`, legacy `opkg` `ipk`, plain
  `tar.gz`, source zip, SHA-256 checksums, and `install.sh` /
  `uninstall.sh` for manual installation.
- **Documentation**: README with configuration reference, build steps and
  provenance notes.

### Fixed during development

- Replaced a regex literal in the template server block with string
  matching; ucode rejected it at render time.
- Wrapped the shared utility module in `baseclass.extend` so
  `L.require('lucent.util')` returns a valid constructor.
- Removed `null` children from `E()` calls and corrected the empty-state
  `hidden` attribute.
- Persisted settings through `uci.load → set → save → uci.commit`; the
  LuCI 26 JavaScript API no longer commits by itself.
- Sent uploads with `base64: true` so `file.write` decodes the payload.
- Let the modal follow native `body.modal-overlay-active` visibility;
  the overlay no longer blocks the login form.
- Fixed horizontal overflow on the dashboard, devices and settings pages
  at 390 px and 280 px widths.
- Started the add-on installer with `setsid` and recorded the background
  shell's own PID so status polling works on images without `nohup`.

</details>
