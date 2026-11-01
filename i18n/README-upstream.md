# Bundled Simplified Chinese catalogs

Lucent's own interface strings are translated in `lucent.po` / `lucent.zh-cn.lmo`.
LuCI's core menu and built-in pages are translated by upstream LuCI language
packs, which many OpenWrt images do not install by default. To make the theme
usable in Chinese out of the box, Lucent also ships two upstream catalogs:

| File in this package | Upstream package | Upstream source |
| --- | --- | --- |
| `lucent-zh-base.zh-cn.lmo` | `luci-i18n-base-zh-cn` 26.304.26398~e969939 | https://downloads.openwrt.org/releases/25.12.6/packages/x86_64/luci/ |
| `lucent-zh-firewall.zh-cn.lmo` | `luci-i18n-firewall-zh-cn` 26.304.26398~e969939 | https://downloads.openwrt.org/releases/25.12.6/packages/x86_64/luci/ |

They are renamed so they do not overwrite or conflict with the official
`base.zh-cn.lmo` / `firewall.zh-cn.lmo`. LuCI loads every `*.zh-cn.lmo` catalog
in `/usr/lib/lua/luci/i18n`, so both can coexist. These files are unmodified
translation data from LuCI (Apache-2.0); Lucent's own UI code is independent.
