#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed" >&2
  exit 1
fi

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

BACKEND_IMAGE="${BACKEND_IMAGE:-}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-}"
FRONTEND_NODE_OPTIONS="${FRONTEND_NODE_OPTIONS:---max-old-space-size=512}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

if [ -z "$BACKEND_IMAGE" ]; then
  echo "ERROR: BACKEND_IMAGE is not set. Put it in .env or export it before running." >&2
  exit 1
fi

if [ -z "$FRONTEND_IMAGE" ]; then
  echo "ERROR: FRONTEND_IMAGE is not set. Put it in .env or export it before running." >&2
  exit 1
fi

if [ -z "$PUBLIC_APP_URL" ]; then
  echo "ERROR: PUBLIC_APP_URL is not set. Frontend production build needs it." >&2
  exit 1
fi

echo "==> Building backend image: $BACKEND_IMAGE ($DOCKER_PLATFORM)"
docker buildx build \
  --platform "$DOCKER_PLATFORM" \
  --provenance=false \
  --sbom=false \
  -f backend/Dockerfile \
  --build-arg INSTALL_DEV_DEPS=false \
  -t "$BACKEND_IMAGE" \
  --load \
  .

echo "==> Pushing backend image: $BACKEND_IMAGE"
docker push "$BACKEND_IMAGE"

echo "==> Building frontend image: $FRONTEND_IMAGE ($DOCKER_PLATFORM)"
docker buildx build \
  --platform "$DOCKER_PLATFORM" \
  --provenance=false \
  --sbom=false \
  -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL="$PUBLIC_APP_URL" \
  --build-arg NODE_OPTIONS="$FRONTEND_NODE_OPTIONS" \
  -t "$FRONTEND_IMAGE" \
  --load \
  .

echo "==> Pushing frontend image: $FRONTEND_IMAGE"
docker push "$FRONTEND_IMAGE"

echo "==> Done"
