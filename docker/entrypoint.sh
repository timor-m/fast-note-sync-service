#!/bin/bash
# Go owns the container lifecycle; Nuxt can fail and restart independently.
set -u
cd /fast-note-sync || exit 1
if [[ $# -eq 0 ]]; then set -- run; fi
if [[ "$1" != "run" ]]; then
    exec ./fast-note-sync-service "$@"
fi

case "${FNS_WEB_FRONTEND_ENABLED:-true}" in
    true|True|TRUE|t|T|1) frontend_enabled=true ;;
    false|False|FALSE|f|F|0) frontend_enabled=false ;;
    *) echo "FNS_WEB_FRONTEND_ENABLED must be a boolean" >&2; exit 64 ;;
esac

go_pid=""
web_pid=""
cleanup() {
    trap '' TERM INT
    [[ -z "$web_pid" ]] || kill -TERM "$web_pid" 2>/dev/null || true
    [[ -z "$go_pid" ]] || kill -TERM "$go_pid" 2>/dev/null || true
    [[ -z "$web_pid" ]] || wait "$web_pid" 2>/dev/null || true
    [[ -z "$go_pid" ]] || wait "$go_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT

frontend_loop() {
    child_pid=""
    trap '[[ -z "$child_pid" ]] || kill -TERM "$child_pid" 2>/dev/null; [[ -z "$child_pid" ]] || wait "$child_pid" 2>/dev/null; exit 0' TERM INT
    export NITRO_HOST=127.0.0.1 NITRO_PORT=3000
    while true; do
        # Persist an automatically generated key across container upgrades/restarts.
        # An explicit environment key takes precedence. Never print the key.
        if [[ -z "${FNS_SESSION_PASSWORD:-${NUXT_SESSION_PASSWORD:-}}" ]]; then
            export FNS_SESSION_PASSWORD
            FNS_SESSION_PASSWORD=$(node -e '
                const fs = require("node:fs"), crypto = require("node:crypto");
                const file = "config/.web-session-key";
                fs.mkdirSync("config", { recursive: true });
                if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
                process.stdout.write(fs.readFileSync(file, "utf8").trim());
            ') || FNS_SESSION_PASSWORD=""
        fi
        mkdir -p "$FNS_SESSION_DIR" && chown node:node "$FNS_SESSION_DIR" || {
            echo "[frontend] cannot prepare session directory" >&2
            sleep 2 & child_pid=$!; wait "$child_pid"; child_pid=""
            continue
        }
        gosu node env -u FNS_ESA_ORIGIN_SECRET node web/.output/server/index.mjs &
        child_pid=$!
        wait "$child_pid"
        status=$?
        child_pid=""
        echo "[frontend] exited with status $status; retrying in 2s" >&2
        sleep 2 & child_pid=$!; wait "$child_pid"; child_pid=""
    done
}

./fast-note-sync-service "$@" &
go_pid=$!
if [[ "$frontend_enabled" == true ]]; then
    frontend_loop &
    web_pid=$!
fi
wait "$go_pid"
exit $?
