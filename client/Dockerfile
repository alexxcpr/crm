# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
ARG NUXT_PUBLIC_API_BASE
ARG NUXT_API_BASE_INTERNAL
ARG NUXT_PUBLIC_DEFAULT_TENANT_SLUG
ENV NUXT_PUBLIC_API_BASE=$NUXT_PUBLIC_API_BASE
ENV NUXT_API_BASE_INTERNAL=$NUXT_API_BASE_INTERNAL
ENV NUXT_PUBLIC_DEFAULT_TENANT_SLUG=$NUXT_PUBLIC_DEFAULT_TENANT_SLUG
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
