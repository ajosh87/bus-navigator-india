# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Copy source and generate static web build
COPY . .
RUN node scripts/generate-assets.js && \
    npx expo export --platform web

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# SPA fallback: any unknown path serves index.html (React Navigation handles routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the exported web bundle
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
