# Deploying ריבועון to ribuon.com

The site runs as two containers on one VPS (`docker-compose.prod.yml`):

| Container | What it does |
|---|---|
| `web` | Caddy. Gets and renews the TLS certificate, serves the built React app from `/srv`, and proxies `/api/*` to `api`. |
| `api` | uvicorn + FastAPI. Reads the repo read-only (`wordgame.py`, `boards/daily/*.json`, `shapes.json`); player progress lives in the `ribuon-db` volume. |

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

`ribuon.com` is registered through Squarespace, and its DNS is served by
`nse1-4.squarespacedns.com`. In the Squarespace DNS panel, delete the parking
records and point both names at the VPS (`164.92.191.7`):

```
A     ribuon.com       164.92.191.7
A     www.ribuon.com   164.92.191.7
```

(Plus `AAAA` records if the VPS has IPv6.) Wait until `dig +short ribuon.com`
returns that address before asking for a certificate - the HTTP-01 challenge
resolves the name from outside.

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
ssh-keygen -t ed25519 -f ~/.ssh/id_ribuon -N ""
cat ~/.ssh/id_ribuon.pub    # add at github.com/TomBenSinai/hebrew_squaredle -> Settings -> Deploy keys
printf 'Host github.com\n  IdentityFile ~/.ssh/id_ribuon\n' >> ~/.ssh/config
```

## 3. First deploy

```bash
sudo mkdir -p /srv && sudo chown "$USER" /srv
git clone git@github.com:TomBenSinai/hebrew_squaredle.git /srv/ribuon
cd /srv/ribuon
cp deploy/env.example .env               # set RIBUON_DOMAIN if it is not ribuon.com
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

Reach the server by its name, not its address: `ssh root@ribuon.com`.

```bash
cd /srv/ribuon && git pull
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
./deploy/backup.sh                       # -> ~/ribuon-backups/ribuon-<stamp>.db.gz
(crontab -l 2>/dev/null; echo '17 4 * * * cd /srv/ribuon && ./deploy/backup.sh') | crontab -
```

Copy them off the machine periodically (`rsync`, `rclone`, whatever you use).

To restore:

```bash
cd /srv/ribuon
gunzip -c ~/ribuon-backups/ribuon-<stamp>.db.gz > /tmp/restore.db
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml cp /tmp/restore.db api:/data/ribuon.db
docker compose -f docker-compose.prod.yml start api
```

The certificates live in the `caddy-data` volume. Keep it; deleting it makes
Caddy re-issue, and Let's Encrypt rate-limits repeats of the same name.

With login on, the database also holds players' email addresses (and hashed
session tokens), so the backups are personal data: keep the copies somewhere
only you can read, and don't keep them longer than you need.

## 8. Login (optional)

Players can log in so their progress follows them to every device: with Google,
or with a link sent by email. Each way turns on when its settings are in `.env`
(see `deploy/env.example`); with none, there is no login button and the game
works exactly as before. `chmod 600 .env` once it holds secrets.

How it works, briefly: logging in sets an HttpOnly, Secure, SameSite=Lax session
cookie (180 days, renewed while used; only its hash is stored). The progress a
browser saved anonymously is moved into the account, and from then on every
device logged in to the same account shares it. One account per verified email,
so Google and an email link with the same address are the same account. Logout
leaves the progress in the account and starts that device afresh. Players can
delete their account (and its progress) from the account card.

### Google

1. [console.cloud.google.com](https://console.cloud.google.com) -> a project ->
   **APIs & Services -> OAuth consent screen**: External, app name ריבועון, your
   support email, the domain `ribuon.com`. The scopes are the basic `openid`,
   `email` and `profile`, which need no review. Publish it ("In production"), or
   only listed test users can log in.
2. **Credentials -> Create credentials -> OAuth client ID**, type *Web application*,
   with the authorized redirect URI `https://ribuon.com/api/auth/google/callback`
   (no JavaScript origins needed: the server does the whole exchange).
3. Put the client ID and secret in `.env`:
   ```
   RIBUON_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   RIBUON_GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

The redirect URI is built from `RIBUON_DOMAIN`, so it must match what is
registered with Google character for character.

### Email links

Any SMTP relay will do (Resend, Brevo, Amazon SES, Postmark...). With the relay:

1. Verify the domain you send from (`ribuon.com`) and add the SPF and DKIM DNS
   records it gives you, plus a DMARC record (`_dmarc.ribuon.com  TXT
   "v=DMARC1; p=none"` is a fine start). Without them the links land in spam.
2. Put the SMTP settings in `.env`:
   ```
   RIBUON_SMTP_HOST=smtp.resend.com
   RIBUON_SMTP_PORT=587
   RIBUON_SMTP_USER=resend
   RIBUON_SMTP_PASSWORD=re_...
   RIBUON_MAIL_FROM="ריבועון <login@ribuon.com>"
   ```

A link works once, for 15 minutes. An address gets at most 3 links per 15
minutes, and an IP 10 an hour. These limits are held in the API process's
memory, which is why the API runs as a single worker.

### Turning it on

```bash
docker compose -f <your compose file> up -d --build   # both: new settings, Caddyfile and API command
curl -s https://ribuon.com/api/auth/me                 # {"providers":{"google":true,"email":true},"user":null}
```

Then log in on a phone, play a word, log in on a computer and check it's there.

The rate limit per IP needs the player's real address. Caddy passes on the one
it trusts (`{client_ip}`; behind another proxy, `trusted_proxies_strict` takes
the rightmost address that isn't a private one), and uvicorn reads it with
`--proxy-headers`. If every request in `logs api` shows the same Docker address,
that chain is broken, and after 10 links in an hour nobody else can get one.

## Sharing a server with another site

This is the case on the VPS the game actually runs on: a `nginx:alpine`
container from another compose project holds 80 and 443, with a `certbot`
container renewing its certificate from a webroot. Nothing has to move. That
nginx starts routing by hostname, and ribuon runs as its own compose project
with **nothing published to the host** - the front nginx reaches it by
container name over the shared Docker network.

```
:443  nginx (the other site's)  ->  miri-regev-...   its own root
                                ->  ribuon.com       ribuon-web:80
                                                       |- /srv        the site
                                                       `- /api/*   -> ribuon-api:8000
```

Use `docker-compose.behind-proxy.yml` instead of `docker-compose.prod.yml`.
It is the same two containers with `auto_https off`, no host ports, and the
front proxy's network joined from outside.

### 1. Bring ribuon up

Log in with `ssh root@ribuon.com`, then:

```bash
git clone git@github.com:TomBenSinai/hebrew_squaredle.git /root/ribuon
cd /root/ribuon
cp deploy/env.example .env
# set RIBUON_PROXY_NETWORK to the front proxy's network:
docker inspect <that-nginx-container> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'

docker compose -f docker-compose.behind-proxy.yml up -d --build
docker exec <that-nginx-container> wget -qO- http://ribuon-web/api/health   # proves the hop
```

Free the build cache afterwards if the disk is tight: `docker builder prune -f`.

### 2. Certificate, then the vhost

`deploy/nginx-ribuon.conf` holds the server blocks. The port-80 block has to be
live *before* certbot can answer the challenge, so it goes in two passes. Back
the config up first, and never reload without `nginx -t`.

```bash
conf=/root/mbti-app/frontend/nginx.conf            # whatever that nginx mounts into conf.d
cp "$conf" "$conf.bak-$(date +%F)"

# pass 1: the listen-80 block only (up to the first `listen 443`)
sed -n '1,/^server {$/p' /root/ribuon/deploy/nginx-ribuon.conf  # ...append that block
docker exec <nginx> nginx -t && docker exec <nginx> nginx -s reload

# the certificate, through the webroot that nginx already serves
docker compose -f /root/mbti-app/docker-compose.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot -d ribuon.com -d www.ribuon.com

# pass 2: append the two listen-443 blocks
docker exec <nginx> nginx -t && docker exec <nginx> nginx -s reload
```

Renewal needs nothing new: the existing certbot loop renews every certificate
in its `/etc/letsencrypt`, ribuon's included.

### 3. Make sure the renewed certificate is actually served

Certbot writing a new certificate is not enough - nginx holds the old one in
memory until it is reloaded, and a `certbot renew` loop has no way to signal a
container it does not know about. Without this, both sites eventually serve an
expired certificate while the files on disk are perfectly current:

```bash
(crontab -l 2>/dev/null || true; \
 echo '0 3 * * * docker exec <nginx> nginx -s reload >/dev/null 2>&1') | crontab -
```

A reload is graceful - in-flight requests finish on the old workers - so a
daily one costs nothing.

### Updating

```bash
ssh root@ribuon.com
cd /root/ribuon && git pull --ff-only
docker compose -f docker-compose.behind-proxy.yml up -d --build web   # or api, per section 5
curl -s https://ribuon.com/api/health
```

### Moving an existing server off the old name

The app used to be called rivuon: the compose project, the `rivuon-db` volume,
`rivuon.db`, the `rivuon-web`/`rivuon-api` containers and the `RIVUON_*` vars in
`.env`. A server deployed before the rename needs one migration after
`git pull`, or the new stack starts on an empty database:

```bash
./deploy/migrate-rivuon-to-ribuon.sh docker-compose.behind-proxy.yml \
    <that-nginx-container> /root/mbti-app/frontend/nginx.conf
```

It copies the volumes (the old ones stay, for a rollback), renames the vars
in `.env` and points the front nginx at `ribuon-web`. The clone can keep its
old folder name: the compose files set the project name themselves. Players
keep their progress: the browser copies its `rivuon:` keys to `ribuon:` ones
on first load.

### To undo

`docker compose -f docker-compose.behind-proxy.yml down`, restore the nginx
config from the `.bak` copy, and reload. The other site is never touched: its
container, its config file's own server blocks and its certificate all stay as
they were.

### Wherever it is served

Three rules survive any proxy: `/api` must be the **same origin** as the page,
`index.html` must not be cached, and `/assets/*` may be cached forever.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| No certificate | `logs -f web`. Usually DNS not pointing here yet, or 80/443 blocked - the HTTP-01 challenge needs port 80. |
| Site loads, game does not | `curl https://ribuon.com/api/health`; then `logs api`. |
| "אין לוח להיום" / 404 on today | The board file for today is missing, or the server clock is wrong. The API uses Asia/Jerusalem regardless of the host timezone; make sure `RIBUON_TODAY` is **not** set in `.env`. |
| Progress lost | Logged out, progress is keyed by the browser's `X-Player-Id`, so a cleared browser is a new player; logging in is how to keep it. Logged in, it's in the account: check `GET /api/auth/me` shows the user. |
| No login button | `curl https://ribuon.com/api/auth/me`: both providers `false` means the settings didn't reach the API. They go in `.env`, then `up -d` again (a `restart` doesn't re-read `.env`). |
| Google: `redirect_uri_mismatch` | The redirect URI registered with Google must be exactly `https://<RIBUON_DOMAIN>/api/auth/google/callback`. |
| Google login returns to `?login=failed` | `logs api` says why ("wrong audience" = client ID mismatch; "token endpoint said 401" = wrong secret). |
| Login emails don't arrive | `logs api` for "could not send login email"; otherwise check the relay's dashboard and the spam folder (SPF/DKIM). |
| "Too many links" for everyone | The API sees one IP for all players: see "Turning it on" in section 8. |
