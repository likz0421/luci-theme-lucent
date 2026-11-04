# Changelog

All notable changes to Lucent 3 are documented here. The project follows
[Semantic Versioning](https://semver.org/).

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
