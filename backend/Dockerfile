# ── builder ───────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY src ./src/

# ── runtime ───────────────────────────────────────────────────────────────────────────────
# node:20-alpine runtime, no devDependencies.
# Target image size < 400 MB (DEPLOY-01).
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user early and own /app so npm ci runs as appuser.
# This ensures node_modules (including @prisma/engines) is owned by appuser
# and Prisma can write its lock file on first start without permission errors.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && chown appuser:appgroup /app

USER appuser

COPY --chown=appuser:appgroup package*.json ./

# --ignore-scripts: skip postinstall `prisma generate` — schema not present
# yet; generated client is copied from builder below.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Overwrite Prisma packages with the generated ones from builder.
COPY --chown=appuser:appgroup --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --chown=appuser:appgroup --from=builder /app/node_modules/@prisma/client  ./node_modules/@prisma/client
COPY --chown=appuser:appgroup --from=builder /app/node_modules/prisma          ./node_modules/prisma
COPY --chown=appuser:appgroup --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma

# Application source and Prisma schema + migrations
COPY --chown=appuser:appgroup --from=builder /app/src ./src
COPY --chown=appuser:appgroup prisma ./prisma/

EXPOSE 3000

# Migrations are intentionally NOT run here.
# Running `prisma migrate deploy` on every container start causes P3009
# (failed migration state) if the container crashes mid-migration.
# Run migrations once as a separate step after deploy:
#   docker compose exec api npx prisma migrate deploy
# See OPERATIONS.md § 2 for the full deploy procedure.
CMD ["node", "src/index.js"]
