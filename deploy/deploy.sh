#!/bin/bash
# Bring the server up to date with origin/main. Run on the server, from anywhere:
#
#   /root/rivuon/deploy/deploy.sh
#
# GitHub Actions runs it on every push to main (.github/workflows/deploy.yml),
# through an ssh key that can run nothing else (docs/DEPLOY.md, "Deploy on merge").
# It refuses to touch a checkout that is off main or has local changes, so a
# hand-made hotfix on the server is never thrown away.
#
# Set RIBUON_COMPOSE to use another compose file (default: the behind-proxy one).

# Everything is inside main(), so bash has read the whole script before
# `git pull` gets a chance to rewrite it.
main() {
    set -euo pipefail
    cd "$(dirname "$0")/.."
    local compose="docker compose -f ${RIBUON_COMPOSE:-docker-compose.behind-proxy.yml}"

    local branch
    branch=$(git rev-parse --abbrev-ref HEAD)
    if [ "$branch" != main ]; then
        echo "deploy: the server is on '$branch', not main - not touching it" >&2
        exit 1
    fi
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        echo "deploy: the server has local changes - not touching it" >&2
        git status --short --untracked-files=no >&2
        exit 1
    fi

    local before
    before=$(git rev-parse HEAD)
    git pull --ff-only --quiet
    echo "deploy: $(git rev-parse --short "$before") -> $(git rev-parse --short HEAD)"

    # Boards and the API's Python are mounted live; the images only need
    # rebuilding when their own files moved. Unchanged images keep their
    # containers running, so this is cheap when nothing did.
    $compose up -d --build --remove-orphans
    docker image prune -f >/dev/null

    # uvicorn runs without --reload, so new Python only takes effect on a restart.
    if ! git diff --quiet "$before" HEAD -- backend wordgame.py; then
        echo "deploy: Python changed, restarting api"
        $compose restart api
    fi

    local i
    for i in $(seq 1 30); do
        if $compose exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" 2>/dev/null; then
            echo "deploy: api healthy"
            exit 0
        fi
        sleep 2
    done
    echo "deploy: api did not answer /api/health within a minute" >&2
    $compose logs --tail 50 api >&2
    exit 1
}
main "$@"
