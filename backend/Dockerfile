# The backend as a sealed, portable image. The same image runs on Render, Cloud Run, Fly.io or
# a laptop. Build:  docker build -t isabella-api backend
#
# Layers are ordered from "changes rarely" to "changes often" so rebuilds are fast: dependencies
# are installed before the application code is copied in.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# uv installs exactly the versions pinned in uv.lock (--frozen), so the image matches CI and dev.
RUN pip install --no-cache-dir uv==0.11.16

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts
COPY docker-entrypoint.sh ./

# Never run as root inside the container: if the app were ever compromised, the attacker would
# have an unprivileged user in a minimal image, not full control.
RUN useradd --create-home --uid 10001 appuser && chmod +x docker-entrypoint.sh && chown -R appuser /app
USER appuser

ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8000
EXPOSE 8000

# The platform restarts the container if this keeps failing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health', timeout=4)"

ENTRYPOINT ["./docker-entrypoint.sh"]
