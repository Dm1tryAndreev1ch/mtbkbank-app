# ── builder ──────────────────────────────────────────────────────────────────
# Runs prisma generate so the generated client lands in node_modules.
# The Prisma CLI itself is NOT copied to the runtime stage.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY src ./src/

# ── runtime ──────────────────────────────────────────────────────────────────
# node:20-alpine runtime, no devDependencies, no Prisma CLI.
# Target image size < 400 MB (DEPLOY-01).
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the generated Prisma client from builder (client only, not the CLI)
COPY --from=builder /app/node_modules/.prisma            ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client     ./node_modules/@prisma/client

# Application source and schema (needed at runtime for prisma migrate deploy)
COPY --from=builder /app/src                             ./src
COPY prisma/schema.prisma                                ./prisma/schema.prisma

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
CMD ["node", "src/index.js"]
