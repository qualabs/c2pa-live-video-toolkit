# Build stage — context is the monorepo root
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./

COPY packages/attack-proxy/package*.json ./packages/attack-proxy/
RUN npm ci --workspace=@qualabs/c2pa-live-attack-proxy --no-audit --no-fund

COPY packages/attack-proxy/tsconfig.json ./packages/attack-proxy/
COPY packages/attack-proxy/src ./packages/attack-proxy/src
RUN npm run build --workspace=@qualabs/c2pa-live-attack-proxy


FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /usr/src/app

RUN apk add --no-cache docker-cli

COPY --from=build /app/packages/attack-proxy/dist ./dist
COPY --from=build /app/packages/attack-proxy/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

EXPOSE 8083

CMD ["node", "dist/server.js"]
