# -- builder ------------------------------------------------------------------
# Runs prisma generate so the generated client lands in node_modules.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY src ./src/

# -- runtime ------------------------------------------------------------------
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

# Copy Prisma CLI so `prisma migrate deploy` can run at container startup
COPY --from=builder /app/node_modules/prisma             ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma        ./node_modules/.bin/prisma

# Application source
COPY --from=builder /app/src ./src

# Full prisma folder (schema + all migration SQL files needed for migrate deploy)
COPY prisma ./prisma/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Run migrations first, then start the app
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node src/index.js"]
