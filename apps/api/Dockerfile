# ============================================================
# CAUSAL API — Production Dockerfile (multi-stage)
# ============================================================
# Stage 1: builder — installs Python deps into a virtual env
# Stage 2: runtime — minimal image with unprivileged user
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM python:3.13-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements and install into isolated venv
COPY requirements/ requirements/
RUN python -m venv /venv \
  && /venv/bin/pip install --upgrade pip \
  && /venv/bin/pip install --no-cache-dir -r requirements/base.txt

# ── Stage 2: Runtime ────────────────────────────────────────
FROM python:3.13-slim AS runtime

LABEL org.opencontainers.image.title="CAUSAL API"
LABEL org.opencontainers.image.description="CAUSAL Causal Resilience & Intervention Engine — FastAPI backend"
LABEL org.opencontainers.image.version="0.11.0"

# Install runtime system deps only (libpq for asyncpg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Create unprivileged user
RUN useradd --create-home --shell /bin/bash --uid 1001 causal

# Copy virtual environment from builder
COPY --from=builder /venv /venv

# Copy application source
WORKDIR /app
COPY --chown=causal:causal . .

# Switch to unprivileged user
USER causal

# Environment defaults (override in compose/k8s)
ENV PATH="/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=8000

EXPOSE 8000

# Healthcheck against liveness endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/v1/health/live || exit 1

# Run with uvicorn
CMD ["/venv/bin/uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info"]
