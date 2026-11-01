# SPDX-License-Identifier: Apache-2.0
#
# Lucent 3 — an independent LuCI theme.
# Drop this directory into feeds/luci/themes/ (or package/) of an OpenWrt
# buildroot / SDK and select it under LuCI -> Themes.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-theme-lucent
PKG_VERSION:=3.3.0
PKG_RELEASE:=1

LUCI_TITLE:=Lucent 3 — independent LuCI theme with a panel dashboard
LUCI_DESCRIPTION:=An independent LuCI theme written from scratch for OpenWrt 23.05+ \
	and 25.12: five palettes, light/dark/auto, configurable glassmorphism, \
	a dashboard with WAN, memory, load and device summaries, a devices view, \
	a media library with magic-byte validated uploads, Bing/Unsplash/Wallhaven \
	wallpapers and an allow-listed package installer. Requires ucode LuCI.
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=likz0421
PKG_REPO:=likz0421/luci-theme-lucent

define Package/luci-theme-lucent/conffiles
/etc/config/lucent
endef

define Package/luci-theme-lucent/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Lucent
	[ "$$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ] && \
		uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
	uci commit luci
	rm -rf /www/luci-static/lucent /tmp/lucent-upload
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
endef

include $(TOPDIR)/feeds/luci/luci.mk
