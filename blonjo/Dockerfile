FROM node:22-alpine

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.28.0

# Non-root user untuk security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies dulu (cache layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Fix ownership
RUN chown -R appuser:appgroup /app

# Expose port dev server
EXPOSE 7500

USER appuser

# Start dev server dengan hot-reload
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0", "--port", "7500"]
