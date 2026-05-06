FROM jrottenberg/ffmpeg:6.0-ubuntu

COPY packages/streamer/scripts /opt/scripts
COPY packages/streamer/input /opt/input

WORKDIR /host_stream

ENTRYPOINT ["/bin/sh", "-c", "mkdir -p /host_stream/input && cp -n /opt/input/* /host_stream/input/ 2>/dev/null; exec sh /opt/scripts/start-all.sh"]
