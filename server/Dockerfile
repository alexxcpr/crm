# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fontconfig \
        fonts-crosextra-caladea \
        fonts-crosextra-carlito \
        fonts-liberation \
        fonts-noto-core \
        libreoffice-writer \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/prisma ./prisma

USER node

EXPOSE 4000

CMD ["node", "dist/src/main.js"]
