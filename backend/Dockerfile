# ── builder ───────────────────────────────────────────────────────────────────────────────
# Runs prisma generate so the generated client lands in node_modules.
# The Prisma CLI is also retained in builder so we can copy it to runtime.
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

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma            ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client     ./node_modules/@prisma/client

# Copy Prisma CLI from builder so `prisma migrate deploy` works at runtime.
# We copy only the packages needed for the CLI — not the full devDependency tree.
COPY --from=builder /app/node_modules/prisma             ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma        ./node_modules/.bin/prisma

# Application source
COPY --from=builder /app/src                             ./src

# Full prisma/ directory: schema.prisma + migrations/
# Both are required by `prisma migrate deploy` at runtime.
COPY prisma ./prisma/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Run migrations first, then start the application.
# `prisma migrate deploy` is idempotent — already-applied migrations are skipped.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node src/index.js"]
