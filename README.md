# Lucent 3

An independent LuCI theme for OpenWrt 25.12 (ucode LuCI), written from scratch.
It borrows *feature ideas* from popular LuCI themes — a dashboard, glass
surfaces, a device list and an appearance panel — but shares no templates,
stylesheets, scripts or package metadata with them.

- Target: OpenWrt 25.12.x, LuCI 26.x (ucode)
- Package: `luci-theme-lucent` 3.2.0
- Licence: Apache-2.0

## Screenshots

![Simplified Chinese login](docs/screenshots/01-login-zh.png)
![Light dashboard](docs/screenshots/02-home-light-zh.png)
![Device list](docs/screenshots/03-devices-light-zh.png)
![Appearance settings](docs/screenshots/04-appearance-light-zh.png)
![Dark dashboard](docs/screenshots/05-home-dark-zh.png)
![Command palette](docs/screenshots/06-command-palette-zh.png)
![Mobile dashboard](docs/screenshots/07-home-mobile-zh.png)

## Features

**Appearance**
- Five palettes: Clay, Celadon, Mist, Dusk, Graphite
- Light, dark and auto (follows `prefers-color-scheme`)
- Configurable glass blur, surface opacity and wallpaper dimming
- Cozy and compact density
- Background image/video from a URL or the router media library
- Custom sidebar logo (PNG, WebP, ICO or SVG)
- Settings are applied live and saved to `/etc/config/lucent`

**Dashboard** (`/cgi-bin/luci/admin/home`)
- Greeting, hostname, firmware and model
- WAN/LAN addresses, uptime, memory, device count and live WAN
  throughput KPIs, refreshed by polling
- Uplink topology (Internet → WAN → router → LAN → Wi-Fi)
- Memory, swap and load rings
- Device list and quick actions
- Wi-Fi radio count and the first configured SSID

**Navigation**
- Grouped sidebar with a mobile drawer
- Command palette: `Ctrl/Cmd+K`, `/`, or the toolbar search button;
  arrow keys + Enter to jump to any visible menu entry
- Simplified Chinese (see below) and English UI

**Devices** (`/cgi-bin/luci/admin/clients`)
- Merges DHCP leases, ARP/neighbour hints and IPv6 addresses
- Search filter, online state, interface name and lease time

**Media library**
- Uploads are streamed to `/tmp/lucent-upload/` in 192 KiB chunks and
  validated by magic bytes on the router before being moved to
  `/www/luci-static/lucent/media/`
- Images up to 8 MiB, videos up to 32 MiB, icons up to 1 MiB
- Online wallpapers from Bing, Unsplash (optional API key) and Wallhaven
- Deleting a file that is currently used as background or logo clears the
  reference instead of leaving a broken path

**Chinese UI**
- All Lucent strings have a maintained `zh_Hans` catalog
- `zh_cn` is registered in `/etc/config/luci`; browsers that ask for
  Chinese are served Chinese automatically
- Upstream LuCI core translations are bundled under distinct catalog
  names, so the menu and built-in pages are Chinese without installing
  `luci-i18n-*` language packs
- Backend error messages from `luci.lucent` go through the same catalog
- Force a language with `uci set luci.main.lang=zh_cn && uci commit luci`

**Optional add-ons**
- A fixed allow-list of LuCI applications can be installed from the package
  feeds already configured on the router. The browser cannot pass a shell
  command, package name or URL; only the eight known keys are accepted.

## Requirements

- OpenWrt 23.05 or newer with ucode-based LuCI (25.12 recommended)
- `luci-base`
- `rpcd`, `rpcd-mod-file` (part of the default image)
- For the optional installer: `apk` (25.12+) or `opkg` (23.05/24.10)

## Install

Download the artifact that matches your firmware:

| Firmware | File |
| --- | --- |
| Any OpenWrt 23.05+ (one command) | `lucent-onekey-install.sh` |
| OpenWrt 25.12 (apk) | `luci-theme-lucent-3.2.0-r1.apk` |
| OpenWrt 23.05/24.10 (opkg) | `luci-theme-lucent_3.2.0-r1_all.ipk` |
| Any (manual) | `lucent-3.2.0.tar.gz` |

One command (theme payload is self-contained; no network needed to install
the theme itself):

```sh
scp lucent-onekey-install.sh root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'sh /tmp/lucent-onekey-install.sh install'
```

Other operations:

```sh
sh /tmp/lucent-onekey-install.sh status
sh /tmp/lucent-onekey-install.sh uninstall
```

`install` first checks for OpenWrt's LuCI web interface. If the router has
no LuCI, it tries to install `luci` (or `luci-base`) from the configured
package feed, so this step requires network access to that feed. The script
then detects `apk`/`opkg`, installs the bundled package, activates Lucent,
registers `zh_cn`, clears LuCI caches and restarts `rpcd`/`uhttpd`. If both
package managers fail it copies the file tree directly. It decodes its
embedded payload with `base64`, or with ucode's `b64dec()` when the image
has no `base64`.

`uninstall` removes the package or manually copied files, deletes the theme
media and bundled Chinese catalogs, restores Bootstrap when Lucent is active,
and clears caches.

apk:

```sh
apk add --allow-untrusted ./luci-theme-lucent-3.2.0-r1.apk
```

opkg:

```sh
opkg install ./luci-theme-lucent_3.2.0-r1_all.ipk
```

Manual:

```sh
tar -xzf lucent-3.2.0.tar.gz -C /tmp
cd /tmp/luci-theme-lucent-3.2.0 && ./install.sh
```

The package registers itself as `Lucent` in `/etc/config/luci` and selects
itself on install when Bootstrap is the current theme. You can switch back at
**System → System → Language and Style**. Uninstall with
`apk del luci-theme-lucent`, `opkg remove luci-theme-lucent`, or
`./uninstall.sh` for a manual install. Removal switches
`luci.main.mediaurlbase` back to Bootstrap and deletes the media library.

## Configuration

`/etc/config/lucent`, section `main`:

| Option | Values | Default |
| --- | --- | --- |
| `palette` | `clay`, `celadon`, `mist`, `dusk`, `graphite` | `clay` |
| `mode` | `light`, `dark`, `auto` | `auto` |
| `glass` | `0`, `1` | `1` |
| `glass_blur` | 0–40 (px) | `20` |
| `glass_alpha` | 30–100 (%) | `62` |
| `bg_dim` | 0–100 | `0` |
| `density` | `cozy`, `compact` | `cozy` |
| `background` | URL or `/luci-static/...` path | empty |
| `logo_image` | URL or `/luci-static/...` path | empty |

Everything is also editable in the Appearance page.

## Layout

```
htdocs/luci-static/lucent/            theme.css, logo.svg, media library
htdocs/luci-static/resources/lucent/  core.js, util.js
htdocs/luci-static/resources/view/lucent/
                                      home.js, clients.js, settings.js
ucode/template/themes/lucent/         header.ut, footer.ut, sysauth.ut
root/usr/libexec/rpcd/luci.lucent     media/wallpaper/plugin helper
root/usr/share/rpcd/acl.d/            helper ACL
root/usr/share/luci/menu.d/           menu entries
root/etc/config/lucent                defaults
```

## Build

The repository can be built with the OpenWrt buildroot/SDK by dropping it into
`feeds/luci/themes/` and selecting **Lucent** in `make menuconfig` →
**LuCI → Themes**.

Standalone artifacts (used for the files in `dist/`) are produced with:

```sh
./scripts/build-apk.sh      # requires apk-tools 3 (APK_BIN=/path/to/apk)
./scripts/build-ipk.sh
./scripts/build-tar.sh
./scripts/build-src.sh
./scripts/build-onekey.sh   # embeds apk + ipk + file tree
./scripts/checksums.sh
```

## Compared with upstream themes

The theme was designed from the feature set users expect from 7Dollar,
Argon and Fluent, but it is not a drop-in clone. Current status:

| Capability | Lucent 3.1 | Notes |
| --- | --- | --- |
| Dashboard with WAN/LAN, uptime, memory, load | Yes | `/admin/home` |
| Live WAN throughput | Yes | Computed client-side from `wan.statistics` |
| Wi-Fi status / SSID | Yes | Radio count + first SSID |
| Online device list | Yes | DHCP + ARP + IPv6 hints |
| Grouped menu + keyboard search | Yes | Sidebar groups, `Ctrl/Cmd+K` palette |
| Multiple palettes / dark mode / glass | Yes | 5 palettes, auto mode, adjustable blur |
| Chinese localization | Yes | Own catalog + bundled LuCI core catalogs |
| Media library / wallpapers / custom logo | Yes | Magic-byte validated uploads |
| Responsive mobile layout | Yes | Drawer below 900 px |
| Native LuCI page compatibility | Yes | Uses the standard theme contract |
| Latency / ping probe | **No** | Not implemented; would need a small helper |
| OpenClash status card | **No** | Not implemented; avoids coupling to one add-on |
| One-command offline installer | Yes | `lucent-onekey-install.sh` |

So: the visible core of the upstream dashboard is covered, but latency
probing and an OpenClash-specific card are deliberately still missing. They
are the two remaining feature gaps, not hidden claims of full parity.

## Security notes

- Uploads are written through the standard `file` ubus object into
  `/tmp/lucent-upload/`; the helper then re-checks size, extension and magic
  bytes before moving the file into the web root.
- The helper never evaluates browser-supplied shell text. Wallpaper providers
  and package names are selected from fixed lists.
- Removing the package removes the theme, its views, helper, ACL and the
  uploaded media library (`/www/luci-static/lucent`). Media survives package
  upgrades so a background does not disappear after `apk upgrade`.

## Provenance

Lucent 3 is a clean-room rewrite produced for this project. Its templates,
CSS, JavaScript and shell helper were written specifically for Lucent and do
not derive from `luci-theme-7dollar`, `luci-theme-argon`, `luci-theme-fluent`
or any other theme source tree. Chinese translation data for LuCI core
pages comes from the upstream `luci-i18n-base-zh-cn` and
`luci-i18n-firewall-zh-cn` packages (Apache-2.0), renamed to avoid file
conflicts and documented in `i18n/README-upstream.md`; that data is not
theme code. Those projects were consulted only to decide
which user-facing capabilities are worth offering (dashboard, palettes,
glass surfaces, device overview, media settings). The LuCI integration points
(`header.ut`/`footer.ut`/`sysauth.ut`, `.cbi-*` selectors, `L.require`,
`rpc.declare`) are the documented interfaces every LuCI theme must implement.
