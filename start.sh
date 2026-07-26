#!/usr/bin/env bash
# Poster Forge · dev launcher
#   - Backend: uvicorn 127.0.0.1:8000 (LAN-isolated)
#   - Frontend: vite 0.0.0.0:5173 (LAN-accessible, /api proxied to backend)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# --- preflight ---
command -v uv >/dev/null 2>&1 || { echo "✗ uv not found. Install: https://docs.astral.sh/uv/"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "✗ pnpm not found. Install: https://pnpm.io/installation"; exit 1; }
[ -f backend/.env ] || { echo "✗ backend/.env missing. Copy from backend/.env.example."; exit 1; }
[ -d frontend/node_modules ] || { echo "→ frontend deps missing, running pnpm install"; (cd frontend && pnpm install); }

# --- LAN IP ---
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"

# --- migrate DB ---
echo "→ alembic upgrade head"
(cd backend && uv run alembic upgrade head)

# --- launch ---
LOG_DIR="$ROOT_DIR/.run"
mkdir -p "$LOG_DIR"

cleanup() {
  echo
  echo "→ stopping…"
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "→ starting backend (uvicorn 127.0.0.1:8000)"
(cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000) \
  > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo "→ starting frontend (vite 0.0.0.0:5173)"
(cd frontend && pnpm dev --host 0.0.0.0 --port 5173) \
  > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# wait for both to bind
sleep 3

cat <<EOF

────────────────────────────────────────
  Poster Forge ready

  Local:   http://localhost:5173
EOF
[ -n "$LAN_IP" ] && echo "  LAN:     http://${LAN_IP}:5173"
cat <<EOF

  Backend: http://127.0.0.1:8000  (loopback only)
  Logs:    $LOG_DIR/backend.log · $LOG_DIR/frontend.log

  Ctrl-C to stop.
────────────────────────────────────────

EOF

wait
