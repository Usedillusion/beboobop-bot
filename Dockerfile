FROM node:22-bookworm-slim

ARG UID=568
ARG GID=568

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -g ${GID} apps 2>/dev/null || true \
 && useradd -u ${UID} -g ${GID} -M -d /app -s /usr/sbin/nologin apps 2>/dev/null || true

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js docker-entrypoint.sh ./
RUN chmod 755 docker-entrypoint.sh \
 && mkdir -p /data \
 && ln -sfn /data/events.json /app/events.json \
 && chown -R ${UID}:${GID} /app /data

ENV NODE_ENV=production \
    HOME=/tmp \
    NPM_CONFIG_CACHE=/tmp/.npm

USER ${UID}:${GID}
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
