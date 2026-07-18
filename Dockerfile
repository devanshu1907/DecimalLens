# Stage 1: Build the Next.js app
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (to leverage cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build config
COPY . .

# Run build compilation
ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_API_URL=http://backend:8000
RUN npm run build

# Stage 2: Runtime image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy package configs and node modules for Next.js runner
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/postcss.config.mjs ./

EXPOSE 3000

CMD ["npm", "run", "start"]
