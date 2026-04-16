# Build stage — context is the monorepo root
FROM node:22-slim AS build

WORKDIR /app

# Copy root workspace manifests and shared tsconfig
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy signer package manifest and install dependencies
COPY packages/signer/package*.json ./packages/signer/
RUN npm install --workspace=@c2pa-live/signer

# Copy signer source and compile
COPY packages/signer/tsconfig.json ./packages/signer/
COPY packages/signer/src ./packages/signer/src
RUN npm run build --workspace=@c2pa-live/signer


FROM node:22-slim AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/packages/signer/dist /app/dist
COPY --from=build /app/packages/signer/package*.json /app/
RUN npm install --omit=dev --no-audit --no-fund

COPY packages/signer/bin/c2patool /usr/local/bin/c2patool
RUN chmod +x /usr/local/bin/c2patool

EXPOSE 8080

CMD ["npm", "start"]
