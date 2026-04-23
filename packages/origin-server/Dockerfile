# Build stage — context is the monorepo root
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./

COPY packages/origin-server/package*.json ./packages/origin-server/
RUN npm ci --workspace=@qualabs/c2pa-live-origin-server --no-audit --no-fund

COPY packages/origin-server/tsconfig.json ./packages/origin-server/
COPY packages/origin-server/src ./packages/origin-server/src
RUN npm run build --workspace=@qualabs/c2pa-live-origin-server


FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY --from=build /app/packages/origin-server/dist ./dist
COPY --from=build /app/packages/origin-server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

EXPOSE 8081

CMD ["node", "dist/server.js"]
