# Changelog

All notable changes to Lucent 3 are documented here. The project follows
[Semantic Versioning](https://semver.org/).

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
