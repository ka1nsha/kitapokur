#!/usr/bin/env bash
# KitapOkur'u başlatır. Ortam değişkenleri:
#   KITAPOKUR_HOST (0.0.0.0), KITAPOKUR_PORT (8000), KITAPOKUR_DATA (./data)
#   KITAPOKUR_VENV (~/.venvs/kitapokur), KITAPOKUR_DEV=1 kod değişince yeniden yükler
set -euo pipefail
cd "$(dirname "$0")"

VENV="${KITAPOKUR_VENV:-$HOME/.venvs/kitapokur}"
if [ ! -x "$VENV/bin/python" ]; then
  echo "Sanal ortam kuruluyor: $VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install -r requirements.txt
fi

ARGS=(--host "${KITAPOKUR_HOST:-0.0.0.0}" --port "${KITAPOKUR_PORT:-8000}"
      --app-dir backend --proxy-headers --no-server-header)
if [ "${KITAPOKUR_DEV:-0}" = "1" ]; then
  ARGS+=(--reload --reload-dir backend)
fi
exec "$VENV/bin/uvicorn" app.main:app "${ARGS[@]}"
