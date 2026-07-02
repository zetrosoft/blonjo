# Stage 1: Builder
FROM python:3.11-slim AS builder

# Install system dependencies yang dibutuhkan untuk compile package python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy configuration files
COPY pyproject.toml .

# Buat virtual environment dan install dependencies menggunakan uv
RUN uv venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN uv pip install -r pyproject.toml

# Stage 2: Runtime
FROM python:3.11-slim AS runtime

# Install runtime system dependencies (Tesseract, OpenGL/OpenCV dependencies, Cairo, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    tesseract-ocr \
    tesseract-ocr-ind \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment dari stage builder
COPY --from=builder /opt/venv /opt/venv

# Buat non-privileged user dan app directory
RUN useradd -m -U appuser && mkdir -p /app && chown -R appuser:appuser /app
WORKDIR /app

# Copy application code
COPY . .
RUN chown -R appuser:appuser /app

# Set environment path agar menggunakan python dari virtualenv
ENV PATH="/opt/venv/bin:$PATH"

USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
