# ══════════════════════════════════════════════════════════════
# Stream Bingo Bot — Multi-stage Docker Build
# ══════════════════════════════════════════════════════════════

# Stage 1: Build the client
FROM node:22-alpine AS client-builder

WORKDIR /app

# Copy workspace package files
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY bot/package.json ./bot/
COPY server/package.json ./server/

# Install all dependencies (needed for Vite build)
RUN npm ci

# Copy source
COPY client/ ./client/
COPY server/ ./server/
COPY .env* ./

# Build the client (outputs to server/public/)
RUN npm run build

# ──────────────────────────────────────────────────────────────

# Stage 2: Production runtime
FROM node:22-alpine

WORKDIR /app

# Copy workspace package files
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY bot/package.json ./bot/
COPY server/package.json ./server/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy bot and server source
COPY bot/ ./bot/
COPY server/ ./server/
COPY start.js ./

# Copy built client from stage 1
COPY --from=client-builder /app/server/public/ ./server/public/

# Create data directory for SQLite
RUN mkdir -p /data

# Environment defaults
ENV PORT=3001
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

EXPOSE 3001

CMD ["node", "start.js"]
