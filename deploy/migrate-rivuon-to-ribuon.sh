#!/bin/sh
# One-off: move a running server from the old name (rivuon) to ribuon.
# The compose project, volumes, containers and env vars were all renamed, so
# the new stack would otherwise start on an empty database.
#
#   ./deploy/migrate-rivuon-to-ribuon.sh <compose-file> [front-nginx-container] [its-config-file]
#
# e.g. behind the other site's nginx:
#   ./deploy/migrate-rivuon-to-ribuon.sh docker-compose.behind-proxy.yml \
#       mbti-app-frontend-1 /root/mbti-app/frontend/nginx.conf
#
# Run it from the repo root after pulling. It stops the old stack, copies each
# old volume into a new one (renaming rivuon.db), renames the vars in .env,
# points the front nginx at ribuon-web and starts the new stack. The old
# volumes are left alone, so going back is: check out the old commit, restore
# .env.bak-rename and the nginx .bak-rename, and `docker compose -p rivuon up`.
set -eu

file="$1"; nginx="${2:-}"; conf="${3:-}"
old="${OLD_PROJECT:-rivuon}"          # the old project name: the folder it was deployed from

# first: the new compose files need the RIBUON_ names, even for `down`
if [ -f .env ]; then
  cp .env .env.bak-rename
  sed -i 's/^RIVUON_/RIBUON_/' .env
  echo ".env: RIVUON_* -> RIBUON_* (old copy in .env.bak-rename)"
fi

echo "stopping the old stack ($old)"
docker compose -p "$old" -f "$file" down

for vol in rivuon-db:ribuon-db caddy-data:caddy-data caddy-config:caddy-config; do
  from="${old}_${vol%%:*}"; name="${vol##*:}"; to="ribuon_$name"
  docker volume inspect "$from" >/dev/null 2>&1 || continue
  if docker volume inspect "$to" >/dev/null 2>&1; then echo "$to already exists, leaving it"; continue; fi
  echo "copying $from -> $to"
  docker volume create --label com.docker.compose.project=ribuon \
    --label com.docker.compose.volume="$name" "$to" >/dev/null
  docker run --rm -v "$from":/from:ro -v "$to":/to alpine sh -c '
    cp -a /from/. /to/
    for f in /to/rivuon.db*; do [ -e "$f" ] && mv "$f" "/to/ribuon.db${f#/to/rivuon.db}"; done; true'
done

docker compose -f "$file" up -d --build

if [ -n "$nginx" ] && [ -n "$conf" ]; then
  cp "$conf" "$conf.bak-rename"
  # write in place: sed -i makes a new file, and a bind-mounted file keeps the old one
  sed 's/rivuon-web/ribuon-web/g; s/\$rivuon\b/$ribuon/g' "$conf.bak-rename" > "$conf"
  if ! docker exec "$nginx" nginx -t; then
    cat "$conf.bak-rename" > "$conf"
    echo "nginx -t failed; put the old config back. Point it at ribuon-web by hand." >&2
    exit 1
  fi
  docker exec "$nginx" nginx -s reload
  echo "nginx now proxies to ribuon-web (old config in $conf.bak-rename)"
fi

echo "done. check: curl -s https://ribuon.com/api/health"
