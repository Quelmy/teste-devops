# ──────────────────────────────────────────────────────────────
#  Stage 1 – builder
#  Install all deps (including devDeps needed only for build steps)
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifest first – leverages Docker layer cache
COPY package*.json ./

# Install ALL dependencies (prod + dev) for build/test stage
RUN npm ci --ignore-scripts

# Copy source
COPY src/ ./src/

# ──────────────────────────────────────────────────────────────
#  Stage 2 – production
#  Minimal image, non-root user, only prod deps
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user & group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy package manifests and install PRODUCTION only deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source from builder stage
COPY --from=builder /app/src ./src

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Health-check: ping /health every 30s, 3s timeout, 3 retries, 10s startup grace
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
