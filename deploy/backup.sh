#!/bin/sh
# Snapshot the progress database. Safe to run while the API is serving:
# sqlite3's backup API copies a consistent view of a live database.
#
#   ./deploy/backup.sh [output-dir]        (default: ~/ribuon-backups)
#
# Keeps the 14 newest snapshots. Run it from the repo root, e.g. from cron:
#   17 4 * * *  cd /srv/ribuon && ./deploy/backup.sh >> /var/log/ribuon-backup.log 2>&1
set -eu

out="${1:-$HOME/ribuon-backups}"
compose="docker compose -f docker-compose.prod.yml"
stamp=$(date +%Y%m%d-%H%M%S)

mkdir -p "$out"
$compose exec -T api python -c "
import sqlite3
src = sqlite3.connect('/data/ribuon.db')
dst = sqlite3.connect('/data/backup.tmp.db')
src.backup(dst)
dst.close()
src.close()
"
$compose cp api:/data/backup.tmp.db "$out/ribuon-$stamp.db"
$compose exec -T api rm -f /data/backup.tmp.db
gzip -f "$out/ribuon-$stamp.db"
echo "$out/ribuon-$stamp.db.gz"

# Prune: keep the 14 newest.
ls -1t "$out"/ribuon-*.db.gz 2>/dev/null | tail -n +15 | while read -r old; do rm -f "$old"; done
