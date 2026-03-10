# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

ARG PORT=80
ENV PORT=${PORT}

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
RUN npm ci --omit=dev

ENV NODE_ENV=production
VOLUME ["/app/data"]
EXPOSE ${PORT}

CMD ["sh", "-c", "npx serve -s dist -l $PORT"]
