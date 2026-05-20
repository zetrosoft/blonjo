FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN useradd -m -U appuser && mkdir -p /app && chown -R appuser:appuser /app
WORKDIR /app

# Copy pyproject.toml for dependency resolution
COPY pyproject.toml .

# Install dependencies using uv
RUN uv pip install --system -r pyproject.toml

# Copy application code
COPY . .
RUN chown -R appuser:appuser /app

USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
