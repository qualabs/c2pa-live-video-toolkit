# Build stage — context is the monorepo root
FROM node AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./

COPY packages/attack-proxy/package*.json ./packages/attack-proxy/
RUN npm install --workspace=@c2pa-live/attack-proxy

COPY packages/attack-proxy/tsconfig.json ./packages/attack-proxy/
COPY packages/attack-proxy/src ./packages/attack-proxy/src
RUN npm run build --workspace=@c2pa-live/attack-proxy


FROM node:18-alpine AS production

ENV NODE_ENV=production

WORKDIR /usr/src/app

RUN apk add --no-cache docker-cli

COPY --from=build /app/packages/attack-proxy/dist ./dist
COPY --from=build /app/packages/attack-proxy/package*.json ./
RUN npm install --omit=dev

EXPOSE 8083

CMD ["node", "dist/server.js"]
