# Backend séries temporelles QuantEXPro — image de production.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dépendances d'abord (cache Docker).
COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install .

# Code applicatif + migrations.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# Utilisateur non-root.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# Applique les migrations puis démarre l'API (Railway fournit $PORT).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
