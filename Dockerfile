# syntax=docker/dockerfile:1
# BuildKit: enables npm cache mount (faster repeated `npm ci`)
# docker buildx build ...  or DOCKER_BUILDKIT=1 docker build ...

# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

ARG PORT=80
ENV PORT=${PORT}

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/server ./server

ENV NODE_ENV=production
VOLUME ["/app/data/"]
EXPOSE ${PORT}

CMD ["npm", "start"]
