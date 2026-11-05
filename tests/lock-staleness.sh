#!/bin/sh
# The update lock must not be held by a recycled PID. `kill -0` alone said
# "An update is already running" forever once a finished job left its pid file
# and that number was later reused by an unrelated process.
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
HELPER="$ROOT/root/usr/libexec/rpcd/luci.lucent"
W=$(mktemp -d)
fails=0
ok() { printf '  PASS %s\n' "$1"; }
no() { printf '  FAIL %s — %s\n' "$1" "$2"; fails=$((fails + 1)); }

awk '/^job_alive\(\)/{on=1} on{print} on && /^}$/{on=0}' "$HELPER" > "$W/fns.sh"
. "$W/fns.sh"

echo "--- job_alive"

job_alive "$W/missing.pid" "$W/job.sh" && no "no pid file means free" "said running" || ok "no pid file means free"

# a pid that is certainly dead
: > "$W/dead.pid"
echo 999999 > "$W/dead.pid"
job_alive "$W/dead.pid" "$W/job.sh" && no "dead pid means free" "said running" || ok "dead pid means free"

# the interesting pair needs /proc, which msys on Windows does not provide
if [ -r "/proc/self/cmdline" ]; then
	# a real script path in argv, the way start-stop-daemon launches the job
	printf '#!/bin/sh\nsleep 30\n' > "$W/job.sh"
	chmod 755 "$W/job.sh"
	sh "$W/job.sh" &
	live=$!
	echo "$live" > "$W/live.pid"
	if job_alive "$W/live.pid" "$W/job.sh"; then
		ok "a live job process holds the lock"
	else
		no "a live job process holds the lock" "refused its own job: $(tr '\000' ' ' < "/proc/$live/cmdline")"
	fi
	# same live pid, different job path: this is PID reuse, and it must NOT
	# be treated as our update still running
	if job_alive "$W/live.pid" "$W/other-job.sh"; then
		no "recycled pid does not hold the lock" "trusted kill -0 alone"
	else
		ok "recycled pid does not hold the lock"
	fi
	kill "$live" 2>/dev/null || true
	wait "$live" 2>/dev/null || true
else
	printf '  SKIP live-pid cases (no readable /proc/<pid>/cmdline here)\n'
fi

# the jobs must clear their own lock, so nothing depends on someone polling
for pair in "UPJOB UPPID" "IJOB PID" "CHECKJOB CHECKPID" "PKGUPJOB PKGUPPID"; do
	job=$(printf '%s' "$pair" | cut -d' ' -f1)
	pidv=$(printf '%s' "$pair" | cut -d' ' -f2)
	body=$(awk -v v="\$$job" 'index($0, "cat > \"" v) > 0 {on=1;next} on && /^[\t ]*EOF/{on=0} on' "$HELPER")
	if printf '%s' "$body" | grep -qF "rm -f '\$$pidv'"; then
		ok "$job clears its own lock ($pidv)"
	else
		no "$job clears its own lock ($pidv)" "left it to the status poller"
	fi
done

rm -rf "$W"

echo
[ "$fails" = 0 ] && echo "locks clear themselves" || { echo "$fails FAILED"; exit 1; }
