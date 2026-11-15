#!/bin/sh
# Issue 33 blind run, PRD-04 §5 step 3: one fresh headless Claude Code session per staged packet.
# The runner never sees the repo. It reads only the stage folders that agent/stage.mjs made (docs/BLIND-RUN.md).
#
#   sh blind-run.sh <root> [parallel=3]          e.g. sh blind-run.sh /tmp/sqc-sonnet
#
# <root> holds run.conf (model=, run_id=, skill_sha=, written by Sid in Part A) and sqc-blind/<n>/<SUP-xx>/ (SKILL.md,
# RUBRIC.md, packet/). Each session runs inside its stage folder with only Read, Glob and Write, no MCP servers, no
# skills or user settings, and --restricted keeps its file tools inside that folder. Its stream-json log is written
# outside the stage (<root>/logs/) and moved in as run.jsonl only when the session ends with a success result.
# A stage with run.jsonl is done and skipped, so running the same command again resumes. Anything a failed or killed
# attempt left (log, stderr, extraction, any other file) goes to <root>/interrupted/ before the packet runs again.
# A failed session writes <root>/STOP: no new sessions start, running ones finish, and the script exits non-zero.
set -u

kit_ok() { # the stage holds exactly what stage.mjs made: SKILL.md, RUBRIC.md, packet/
  [ "$(cd "$1" && LC_ALL=C ls -A | tr '\n' ' ')" = "RUBRIC.md SKILL.md packet " ]
}

if [ "${1:-}" = "--one" ]; then
  d=$2 root=$3
  [ -f "$d/run.jsonl" ] && exit 0
  [ -f "$root/STOP" ] && exit 0
  . "$root/run.conf"
  n=$(basename "$(dirname "$d")") id=$(basename "$d")
  log="$root/logs/$n-$id.jsonl" err="$root/logs/$n-$id.err"
  park() { # move every leftover of an attempt out of the stage and the log folder
    bad="$root/interrupted/$n-$id-$(date +%Y%m%d-%H%M%S)-$1"
    mkdir -p "$bad"
    [ -f "$log" ] && mv "$log" "$bad/run.jsonl"
    [ -f "$err" ] && mv "$err" "$bad/stderr.txt"
    for f in "$d"/* "$d"/.[!.]*; do
      case "$(basename "$f")" in SKILL.md|RUBRIC.md|packet|'*'|'.[!.]*') ;; *) mv "$f" "$bad/" ;; esac
    done
  }
  { [ -f "$log" ] || ! kit_ok "$d"; } && park killed  # an attempt that was cut off (Ctrl-C, crash, reboot)
  kit_ok "$d" || { echo "FAIL  $n $id: stage changed (packet/ edited?); stopping" >&2; touch "$root/STOP"; exit 1; }
  [ -f "$root/STOP" ] && exit 0  # another packet failed while this one was being prepared
  mkdir -p "$root/logs"
  echo "start $n $id $(date '+%H:%M:%S')"
  (cd "$d" && claude -p "Run the skill in SKILL.md on ./packet; write extraction.json. run_id: $run_id, model: $model, skill_sha: $skill_sha" \
    --model "$model" --tools Read,Glob,Write --allowedTools Read,Glob,Write --strict-mcp-config \
    --disable-slash-commands --restricted --no-session-persistence --output-format stream-json --verbose) >"$log" 2>"$err"
  code=$?
  last=$(tail -n 1 "$log")
  case "$last" in
    *'"type":"result"'*) case "$last" in *'"subtype":"success"'*) case "$last" in *'"is_error":false'*) ok=$code ;; *) ok=1 ;; esac ;; *) ok=1 ;; esac ;;
    *) ok=1 ;;
  esac
  if [ "$ok" -eq 0 ]; then
    mv "$log" "$d/run.jsonl" && rm -f "$err" && echo "done  $n $id $(date '+%H:%M:%S')" && exit 0
  fi
  park failed
  touch "$root/STOP"
  echo "FAIL  $n $id (exit $code), kept in $bad; no new sessions will start" >&2
  exit 1
fi

[ $# -ge 1 ] || { echo "usage: sh $0 <root> [parallel]" >&2; exit 2; }
root=$(cd "$1" 2>/dev/null && pwd -P) || { echo "no folder $1" >&2; exit 2; }
par=${2:-3}
[ -d "$root/sqc-blind" ] && [ -f "$root/run.conf" ] || { echo "$root has no sqc-blind/ or run.conf" >&2; exit 2; }
model= run_id= skill_sha=
. "$root/run.conf"
echo "$model" | grep -Eq '^claude-[a-z0-9-]+$' || { echo "run.conf: bad model '$model'" >&2; exit 2; }
echo "$run_id" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}[A-Za-z0-9._-]*$' || { echo "run.conf: bad run_id '$run_id'" >&2; exit 2; }
echo "$skill_sha" | grep -Eq '^[0-9a-f]{7,40}$' || { echo "run.conf: bad skill_sha '$skill_sha'" >&2; exit 2; }
command -v claude >/dev/null || { echo "claude not found: install Claude Code first" >&2; exit 2; }
# A CLAUDE.md above the stages would be loaded into every session.
d=$root
while :; do
  for f in CLAUDE.md CLAUDE.local.md .claude; do [ -e "$d/$f" ] && { echo "remove $d/$f first: it would reach the sessions" >&2; exit 2; }; done
  [ "$d" = / ] && break
  d=$(dirname "$d")
done
rm -f "$root/STOP"
echo "$model, run $run_id, skill $skill_sha"
find "$root/sqc-blind" -mindepth 2 -maxdepth 2 -type d | sort |
  xargs -P "$par" -I{} sh "$0" --one {} "$root"
left=$(find "$root/sqc-blind" -mindepth 2 -maxdepth 2 -type d | while read -r d; do [ -f "$d/run.jsonl" ] || echo "$d"; done | wc -l | tr -d " ")
echo "$model: $left packet(s) without a finished run"
[ "$left" -eq 0 ] && [ ! -f "$root/STOP" ]
