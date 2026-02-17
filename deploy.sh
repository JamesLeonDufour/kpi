#!/usr/bin/env bash
set -euo pipefail

IMAGE="ghcr.io/jamesleondufour/kpi:custom-branding"
KOBO_DIR="/root/kobo-docker"
COMPOSE_PROJECT="kobofe"
COMPOSE_MAIN="docker-compose.frontend.yml"
COMPOSE_OVERRIDE="docker-compose.frontend.override.yml"

echo "==> Pulling latest image: $IMAGE"
docker pull "$IMAGE"

echo "==> Recreating frontend containers..."
cd "$KOBO_DIR"
docker compose -p "$COMPOSE_PROJECT" \
  -f "$COMPOSE_MAIN" \
  -f "$COMPOSE_OVERRIDE" \
  up -d

echo "==> Verifying image..."
docker inspect "${COMPOSE_PROJECT}-kpi-1" --format '{{.Config.Image}}'

echo "==> Done! Clear your browser cache and check the site."
