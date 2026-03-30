FROM node AS build

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install -g typescript ts-node

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM debian:sid AS production

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update && \
    apt-get install -y curl gnupg nodejs npm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist /app/dist
COPY --from=build /app/package*.json /app/
RUN npm install --omit=dev

COPY ./bin/c2patool /usr/local/bin/c2patool
COPY ./certs /app/certs
COPY segment_manifest.json /app/segment_manifest.json
COPY segment_manifest_vsi.json /app/segment_manifest_vsi.json
RUN chmod +x /usr/local/bin/c2patool

EXPOSE 8080

CMD ["npm", "start"]
