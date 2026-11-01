# Changelog

All notable changes to Lucent 3 are documented here. The project follows
[Semantic Versioning](https://semver.org/).

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
