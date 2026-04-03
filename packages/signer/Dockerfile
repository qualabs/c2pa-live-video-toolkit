# Build stage — context is the monorepo root
FROM node AS build

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


FROM debian:sid AS production

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update && \
    apt-get install -y curl gnupg nodejs npm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/packages/signer/dist /app/dist
COPY --from=build /app/packages/signer/package*.json /app/
RUN npm install --omit=dev

COPY packages/signer/bin/c2patool /usr/local/bin/c2patool
COPY packages/signer/certs /app/certs
COPY packages/signer/segment_manifest.json /app/segment_manifest.json
COPY packages/signer/segment_manifest_vsi.json /app/segment_manifest_vsi.json
RUN chmod +x /usr/local/bin/c2patool

EXPOSE 8080

CMD ["npm", "start"]
