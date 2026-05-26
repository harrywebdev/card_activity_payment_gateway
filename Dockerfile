FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- Builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# disco env vars are available as Docker build secrets at /run/secrets/.env
# NEXT_PUBLIC_* vars must be set at build time (Next.js inlines them into the client bundle)
ARG NEXT_PUBLIC_APP_ENV=production
ARG DISCO_DEPLOYMENT_NUMBER
RUN --mount=type=secret,id=.env \
  env $(grep -v '^#' /run/secrets/.env | grep -v '^\s*$' | xargs) \
  npm run build

# --- Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Cron scripts
COPY --chown=nextjs:nodejs scripts/ ./scripts/

# Data directory (persistent volume)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
