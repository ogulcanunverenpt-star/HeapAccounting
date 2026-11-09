#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
command -v docker >/dev/null 2>&1 || { echo 'Install and start Docker with Compose first.' >&2; exit 1; }
docker compose version >/dev/null
command -v curl >/dev/null 2>&1 || { echo 'curl is required for the readiness check.' >&2; exit 1; }
if [ -z "${MATRIX_URL:-}" ]; then printf 'Matrix homeserver URL: '; read -r MATRIX_URL; fi
if [ -z "${EXAM_ADMIN_IDS:-}" ]; then printf 'Matrix administrator ID: '; read -r EXAM_ADMIN_IDS; fi
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    printf 'PostgreSQL password (reuse it for an existing database): '
    stty -echo
    trap 'stty echo' EXIT INT TERM
    read -r POSTGRES_PASSWORD
    stty echo
    trap - EXIT INT TERM
    printf '\n'
fi
[ -n "$MATRIX_URL" ] && [ -n "$EXAM_ADMIN_IDS" ] && [ -n "$POSTGRES_PASSWORD" ] || { echo 'Matrix URL, admin ID and password are required.' >&2; exit 1; }
export MATRIX_URL EXAM_ADMIN_IDS POSTGRES_PASSWORD
printf 'Build and start Docker services? Existing project containers may be recreated. [y/N] '
read -r answer
case "$answer" in y|Y) ;; *) echo 'Cancelled.' >&2; exit 1 ;; esac
cd "$root"
if [ -f "$root/src/exam-service/.env" ]; then
    docker compose --env-file "$root/src/exam-service/.env" up --build -d
else
    docker compose up --build -d
fi
unset POSTGRES_PASSWORD
ready=''
for i in $(seq 1 40); do
    if curl --silent --fail --max-time 2 http://127.0.0.1:8080/api/config >/dev/null; then ready=1; break; fi
    sleep 1
done
if [ -z "$ready" ]; then echo 'Services not ready; inspect docker compose logs. Containers were not stopped.' >&2; exit 1; fi
echo 'HeapAccounting is ready at http://localhost:8080.'
if command -v xdg-open >/dev/null 2>&1; then xdg-open 'http://localhost:8080' >/dev/null 2>&1 || echo 'Open the URL manually.'; fi
