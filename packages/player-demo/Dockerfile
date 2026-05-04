FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./

COPY packages/player-demo/package*.json ./packages/player-demo/
COPY packages/c2pa-player-core/package*.json ./packages/c2pa-player-core/
COPY packages/dashjs-plugin/package*.json ./packages/dashjs-plugin/
COPY packages/hls-plugin/package*.json ./packages/hls-plugin/
COPY packages/hlsjs-plugin/package*.json ./packages/hlsjs-plugin/
COPY packages/videojs-ui/package*.json ./packages/videojs-ui/
COPY packages/videojs-c2pa-ui/package*.json ./packages/videojs-c2pa-ui/

RUN npm ci --no-audit --no-fund

COPY packages/c2pa-player-core ./packages/c2pa-player-core
COPY packages/dashjs-plugin ./packages/dashjs-plugin
COPY packages/hls-plugin ./packages/hls-plugin
COPY packages/hlsjs-plugin ./packages/hlsjs-plugin
COPY packages/videojs-ui ./packages/videojs-ui
COPY packages/videojs-c2pa-ui ./packages/videojs-c2pa-ui
COPY packages/player-demo ./packages/player-demo

RUN npm run build --workspace=@qualabs/c2pa-live-player-demo


FROM nginx:alpine AS production

COPY packages/player-demo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/player-demo/dist /usr/share/nginx/html

EXPOSE 3008

CMD ["nginx", "-g", "daemon off;"]
