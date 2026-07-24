#!/usr/bin/env bash
# P5-OPS — Alembic current / heads / upgrade head (0005 = anti_library).
# Usage (depuis backend/) :
#   export QX_DATABASE_URL='postgresql+asyncpg://…'
#   ./scripts/ops_migrate.sh           # upgrade
#   ./scripts/ops_migrate.sh --check   # lecture seule
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${QX_DATABASE_URL:-}" ]]; then
  echo "ERR: QX_DATABASE_URL requis (postgresql+asyncpg://…)." >&2
  exit 1
fi

if ! command -v alembic >/dev/null 2>&1; then
  if [[ -x "$ROOT/.venv/bin/alembic" ]]; then
    # shellcheck disable=SC1091
    source "$ROOT/.venv/bin/activate"
  else
    echo "ERR: alembic introuvable — active .venv ou pip install ." >&2
    exit 1
  fi
fi

echo "=== alembic heads (attendu : 0005) ==="
alembic heads
echo
echo "=== alembic current (avant) ==="
alembic current || true

if [[ "${1:-}" == "--check" ]]; then
  echo
  echo "Mode --check : pas d'écriture."
  exit 0
fi

echo
echo "=== alembic upgrade head ==="
alembic upgrade head

echo
echo "=== alembic current (après) ==="
alembic current

CUR="$(alembic current 2>/dev/null | head -1 || true)"
if echo "$CUR" | grep -q "0005"; then
  echo "OK: head 0005 (anti_library) atteinte."
  exit 0
fi
echo "WARN: current ne contient pas 0005 — vérifie la sortie ci-dessus." >&2
exit 2
