#!/bin/sh
# Lucent daily wallpaper fetcher (cron target). Only runs while
#   uci get lucent.main.wallpaper_auto = 1
# Fetches the Bing daily image, replaces the previous auto wallpaper and
# points lucent.main.background at it. No user input reaches this script.

ROOT="/www/luci-static/lucent/media/wallpaper"
TMP="/tmp/lucent-wallpaper-auto.json"
IMG="/tmp/lucent-wallpaper-auto.img"

[ "$(uci -q get lucent.main.wallpaper_auto)" = "1" ] || exit 0

fetch() {
	rm -f "$2"
	if command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -q -T 30 -O "$2" "$1" >/dev/null 2>&1
	elif command -v wget >/dev/null 2>&1; then
		wget -q -T 30 -O "$2" "$1" >/dev/null 2>&1
	else
		return 1
	fi
	[ -s "$2" ]
}

url=""
if fetch "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN" "$TMP"; then
	url=$(jsonfilter -i "$TMP" -e '@.images[0].url' 2>/dev/null)
fi
[ -n "$url" ] || exit 1
case "$url" in
	http*) ;;
	'') exit 1 ;;
	*) url="https://www.bing.com$url" ;;
esac

fetch "$url" "$IMG" || exit 1
# keep only real images (jpeg/png/webp magic)
head=$(hexdump -v -n 4 -e '1/1 "%02x"' "$IMG" 2>/dev/null)
case "$head" in
	ffd8ff*|89504e47*) ;;
	*) rm -f "$IMG"; exit 1 ;;
esac

mkdir -p "$ROOT"
day=$(date +%Y%m%d)
new="$ROOT/auto-bing-$day.jpg"
mv -f "$IMG" "$new" || exit 1
chmod 644 "$new" 2>/dev/null
for f in "$ROOT"/auto-bing-*.jpg; do
	[ "$f" != "$new" ] && rm -f "$f"
done

uci set lucent.main.background="/luci-static/lucent/media/wallpaper/auto-bing-$day.jpg"
uci commit lucent
exit 0
