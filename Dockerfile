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
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY schema.sql ./schema.sql
EXPOSE 3001
# DATABASE_URL, ANTHROPIC_API_KEY, FDC_API_KEY are provided at runtime (env).
CMD ["node", "server/index.js"]
