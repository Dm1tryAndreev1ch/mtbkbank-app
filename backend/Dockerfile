# ── builder ───────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY src ./src/

# ── runtime ───────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user BEFORE any COPY so we can use --chown on every layer.
# All files land as appuser:appgroup from the start — Prisma engine binaries
# write a lock file on first run and require ownership of node_modules/@prisma.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --chown=appuser:appgroup package*.json ./
# --ignore-scripts skips the postinstall `prisma generate` hook — schema.prisma
# is not present at this point and the generated client comes from builder.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy the generated Prisma client from builder
COPY --chown=appuser:appgroup --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --chown=appuser:appgroup --from=builder /app/node_modules/@prisma/client  ./node_modules/@prisma/client

# Copy Prisma CLI from builder so `prisma migrate deploy` works at runtime.
COPY --chown=appuser:appgroup --from=builder /app/node_modules/prisma          ./node_modules/prisma
COPY --chown=appuser:appgroup --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma

# Application source
COPY --chown=appuser:appgroup --from=builder /app/src ./src

# Full prisma/ directory: schema.prisma + migrations/
COPY --chown=appuser:appgroup prisma ./prisma/

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node src/index.js"]
