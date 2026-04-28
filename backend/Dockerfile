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

# Create non-root user early. /app is owned by root at this point which is fine
# — we chown the workdir so appuser can write into it, then switch USER before
# npm ci so the entire node_modules tree is created with correct ownership.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && chown appuser:appgroup /app

USER appuser

COPY --chown=appuser:appgroup package*.json ./

# Run as appuser so node_modules (including @prisma/engines) is owned by appuser.
# --ignore-scripts skips postinstall `prisma generate` — schema not present yet
# and the generated client is copied from builder below.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Overwrite Prisma packages with the ones generated in builder.
# These replace the npm-installed stubs with the correct generated client.
COPY --chown=appuser:appgroup --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --chown=appuser:appgroup --from=builder /app/node_modules/@prisma/client  ./node_modules/@prisma/client
COPY --chown=appuser:appgroup --from=builder /app/node_modules/prisma          ./node_modules/prisma
COPY --chown=appuser:appgroup --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma

# Application source and Prisma schema + migrations
COPY --chown=appuser:appgroup --from=builder /app/src ./src
COPY --chown=appuser:appgroup prisma ./prisma/

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node src/index.js"]
