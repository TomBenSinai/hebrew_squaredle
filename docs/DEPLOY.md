# Deploying ריבועון to ribuon.com

The site runs as two containers on one VPS (`docker-compose.prod.yml`):

| Container | What it does |
|---|---|
| `web` | Caddy. Gets and renews the TLS certificate, serves the built React app from `/srv`, and proxies `/api/*` to `api`. |
| `api` | uvicorn + FastAPI. Reads the repo read-only (`wordgame.py`, `boards/daily/*.json`, `shapes.json`); player progress lives in the `rivuon-db` volume. |

Everything is one origin, so there is no CORS and no third-party-cookie problem.
The API port is never published to the internet - only Caddy listens on 80/443.

## Why a VPS

The game wants a real disk and a long-lived process: progress is a SQLite file,
the boards are JSON files read off disk, and `/api/define` fetches Milog on the
server. A serverless host would mean swapping SQLite for a managed database and
paying cold starts, for no gain at this size. One small VPS (1 vCPU / 1 GB is
plenty) serves this comfortably.

Optionally put Cloudflare in front for DNS, caching and DDoS filtering - it
changes nothing below except that you set the records in Cloudflare and can turn
the orange cloud on once the certificate has been issued.

## 1. DNS

At the registrar for `ribuon.com`, point both names at the server's IP:

```
A     ribuon.com       <server-ip>
A     www.ribuon.com   <server-ip>
```

(Plus `AAAA` records if the VPS has IPv6.) Wait until `dig +short ribuon.com`
returns the IP before starting the stack - Caddy needs the name to resolve to
get a certificate.

## 2. Server prep

```bash
# Docker Engine + compose plugin (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"          # log out and back in

# Only 80, 443 and ssh need to be open
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

Give the server read access to the GitHub repo (a deploy key is simplest):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_rivuon -N ""
cat ~/.ssh/id_rivuon.pub    # add at github.com/TomBenSinai/hebrew_squaredle -> Settings -> Deploy keys
printf 'Host github.com\n  IdentityFile ~/.ssh/id_rivuon\n' >> ~/.ssh/config
```

## 3. First deploy

```bash
sudo mkdir -p /srv && sudo chown "$USER" /srv
git clone git@github.com:TomBenSinai/hebrew_squaredle.git /srv/rivuon
cd /srv/rivuon
cp deploy/env.example .env               # set RIVUON_DOMAIN if it is not ribuon.com
docker compose -f docker-compose.prod.yml up -d --build
```

The first start takes a minute or two: it builds the site and asks Let's Encrypt
for a certificate. Watch it with
`docker compose -f docker-compose.prod.yml logs -f web`.

Docker's own service starts the containers again after a reboot (`restart:
unless-stopped`), so there is nothing to add to systemd.

## 4. Verify

```bash
curl -s https://ribuon.com/api/health          # {"ok":true,"today":"...","boards":212}
curl -sI https://www.ribuon.com | head -1      # 301 to the apex
curl -s https://ribuon.com | grep -o '<title>.*</title>'
```

Then open the site on a phone: play a word, reload, and check the word is still
there (that is the API and the database round-trip, not just localStorage).

## 5. Updating

```bash
cd /srv/rivuon && git pull
```

- **New boards only** (`boards/daily/*.json`): nothing else to do. The repo is
  mounted live and the API re-reads the directory per request.
- **Backend code or dependencies**:
  `docker compose -f docker-compose.prod.yml up -d --build api`
- **Frontend**: `docker compose -f docker-compose.prod.yml up -d --build web`
  (the site is rebuilt inside the image; `index.html` is served `no-cache`, so
  the new asset hashes reach everyone on the next load).

Deploy from `main` only, and never `--force` a regeneration of today or a past
day on the server: `boards/daily/*.json` is the record players' progress is
checked against.

## 6. Keeping the schedule ahead

Boards are generated on a workstation and committed - generation needs the word
lists in `data/`, and a board must never change after it has been played.

```bash
python generate_days.py --days 90        # skips days that already exist
git add boards/daily && git commit -m "Boards through <date>" && git push
```

Then `git pull` on the server. Boards currently run through **2027-03-31**; top
them up a couple of months before that. `/api/health` reports the board count,
and `GET /api/days` shows the newest playable day, so a monitor on either will
warn you before the well runs dry.

## 7. Backups

`deploy/backup.sh` snapshots the SQLite database while it is serving and keeps
the 14 newest copies:

```bash
./deploy/backup.sh                       # -> ~/rivuon-backups/rivuon-<stamp>.db.gz
(crontab -l 2>/dev/null; echo '17 4 * * * cd /srv/rivuon && ./deploy/backup.sh') | crontab -
```

Copy them off the machine periodically (`rsync`, `rclone`, whatever you use).

To restore:

```bash
cd /srv/rivuon
gunzip -c ~/rivuon-backups/rivuon-<stamp>.db.gz > /tmp/restore.db
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml cp /tmp/restore.db api:/data/rivuon.db
docker compose -f docker-compose.prod.yml start api
```

The certificates live in the `caddy-data` volume. Keep it; deleting it makes
Caddy re-issue, and Let's Encrypt rate-limits repeats of the same name.

## If the server already serves other sites

Don't run this `web` container - it wants 80 and 443. Instead build the site and
let the existing proxy serve it:

```bash
compose="docker compose -f docker-compose.prod.yml"
$compose up -d api                       # api only
$compose build web
id=$(docker create "$($compose images -q web)")
docker cp "$id:/srv" /var/www/ribuon.com && docker rm "$id"
```

and publish the API on the loopback (add `ports: ["127.0.0.1:8001:8000"]` to
`api`), then in nginx:

```nginx
root /var/www/ribuon.com;
location / { try_files $uri /index.html; }
location /api/ { proxy_pass http://127.0.0.1:8001; }
```

The rules that matter wherever it is served: `/api` must be the **same origin**
as the page, `index.html` must not be cached, and `/assets/*` may be cached
forever.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| No certificate | `logs -f web`. Usually DNS not pointing here yet, or 80/443 blocked - the HTTP-01 challenge needs port 80. |
| Site loads, game does not | `curl https://ribuon.com/api/health`; then `logs api`. |
| "אין לוח להיום" / 404 on today | The board file for today is missing, or the server clock is wrong. The API uses Asia/Jerusalem regardless of the host timezone; make sure `RIVUON_TODAY` is **not** set in `.env`. |
| Progress lost | Progress is keyed by the browser's `X-Player-Id`; a cleared browser is a new player. Until login exists, that is expected. |
