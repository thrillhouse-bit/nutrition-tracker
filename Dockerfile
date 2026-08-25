# Single-image deploy: build the PWA, then run the Express server which serves
# both the static app and the API. Works on any Node host (Render, Railway,
# Fly, Cloud Run, a plain VPS). Put HTTPS in front of it (a reverse proxy such
# as Caddy/nginx) — the camera and service worker require a secure origin.

# --- build the frontend ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Baked in at build time (docker build --build-arg GIT_SHA=$(git rev-parse HEAD),
# or GIT_SHA=$(git rev-parse HEAD) docker compose ... up -d --build) so GET
# /api/version can report exactly what's running — there was previously no way
# to confirm a deploy short of comparing built asset bytes by hand.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY schema.sql ./schema.sql
EXPOSE 3001
# DATABASE_URL, ANTHROPIC_API_KEY, FDC_API_KEY are provided at runtime (env).
CMD ["node", "server/index.js"]
