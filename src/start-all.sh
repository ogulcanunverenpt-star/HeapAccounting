#!/bin/sh
set -eu
src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
frontend="$src/serverroot"
service="$src/exam-service"
confirm() {
    printf '%s [y/N] ' "$1"
    read -r answer
    case "$answer" in y|Y) ;; *) echo 'Installation cancelled.' >&2; exit 1 ;; esac
}
command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || {
    echo 'Install Node.js 22.15+ and npm, or use the Docker launcher.' >&2; exit 1;
}
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=15)?0:1)" || {
    echo 'Node.js 22.15+ is required.' >&2; exit 1;
}
if ! command -v make >/dev/null 2>&1 || ! command -v cc >/dev/null 2>&1; then
    confirm 'C build tools are missing. Install them using the system package manager?'
    sh "$src/install.sh"
fi
if ! command -v "${WASM_CC:-clang}" >/dev/null 2>&1 || ! command -v wasm-ld >/dev/null 2>&1; then
    confirm 'Clang and lld are missing. Install them using the system package manager?'
    if [ "$(id -u)" -eq 0 ]; then sudo_cmd=''; elif command -v sudo >/dev/null 2>&1; then sudo_cmd=sudo; else echo 'Root or sudo is required.' >&2; exit 1; fi
    if command -v apt-get >/dev/null 2>&1; then $sudo_cmd apt-get update; $sudo_cmd apt-get install -y clang lld
    elif command -v dnf >/dev/null 2>&1; then $sudo_cmd dnf install -y clang lld
    elif command -v apk >/dev/null 2>&1; then $sudo_cmd apk add clang lld
    elif command -v pacman >/dev/null 2>&1; then $sudo_cmd pacman -S --needed --noconfirm clang lld
    else echo 'Install clang and lld manually.' >&2; exit 1; fi
fi
if [ ! -d "$frontend/node_modules/vite" ] || [ ! -d "$frontend/node_modules/exceljs" ]; then (cd "$frontend" && npm install --no-audit --no-fund); fi
if [ ! -d "$service/node_modules/pg" ]; then (cd "$service" && npm install --no-audit --no-fund); fi
if [ ! -e "$service/.env" ]; then
    printf 'Matrix administrator ID (for example @name:matrix.org): '
    read -r admin
    case "$admin" in @*:* ) ;; *) echo 'Invalid Matrix administrator ID.' >&2; exit 1 ;; esac
    case "$admin" in *[!A-Za-z0-9._=:+/@-]* ) echo 'Invalid Matrix administrator ID.' >&2; exit 1 ;; esac
    sed "s|^EXAM_ADMIN_IDS=$|EXAM_ADMIN_IDS=$admin|" "$service/.env.example" > "$service/.env"
fi
api_port=$(cd "$service" && node --input-type=module -e "import { loadServiceEnvironment } from './environment.js'; loadServiceEnvironment(); console.log(process.env.PORT || '3491')")
web_port=${WEB_PORT:-3490}
for port in "$api_port" "$web_port"; do
    case "$port" in ''|*[!0-9]*) echo 'Invalid API or web port.' >&2; exit 1 ;; esac
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then echo 'Invalid API or web port.' >&2; exit 1; fi
    if ! node -e "const s=require('net').createServer();s.on('error',()=>process.exit(1));s.listen(Number(process.argv[1]),'127.0.0.1',()=>s.close());" "$port"; then
        echo "Port $port is already in use; stop the existing service and retry." >&2; exit 1
    fi
done
[ "$api_port" != "$web_port" ] || { echo 'API and web ports must be different.' >&2; exit 1; }
[ -z "${EXAM_API_PORT:-}" ] || [ "$EXAM_API_PORT" = "$api_port" ] || { echo 'EXAM_API_PORT does not match the API PORT.' >&2; exit 1; }
EXAM_API_PORT=$api_port
export EXAM_API_PORT
(cd "$frontend" && npm run build)
(cd "$src" && make)
mkdir -p "$service/data"
api_pid=''
web_pid=''
cleanup() {
    if [ -n "$api_pid" ] && kill -0 "$api_pid" 2>/dev/null; then kill "$api_pid"; fi
    if [ -n "$web_pid" ] && kill -0 "$web_pid" 2>/dev/null; then kill "$web_pid"; fi
}
trap cleanup EXIT
trap 'exit 1' INT TERM
(cd "$service" && exec node server.js) >"$service/data/api.log" 2>&1 &
api_pid=$!
(cd "$src" && exec ./server) >"$service/data/web.log" 2>&1 &
web_pid=$!
ready=''
for i in $(seq 1 40); do
    if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$web_pid" 2>/dev/null; then
        echo "A service exited; check $service/data/api.log and web.log." >&2; exit 1
    fi
    if node -e "fetch('http://127.0.0.1:'+process.argv[1]+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$web_port"; then ready=1; break; fi
    sleep 1
done
if [ -z "$ready" ]; then echo "Startup failed; check $service/data/api.log and web.log." >&2; exit 1; fi
echo "HeapAccounting is ready at http://localhost:$web_port. Press Ctrl+C to stop."
if command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$web_port" >/dev/null 2>&1 || echo 'Open the URL manually.'; fi
wait "$web_pid"
