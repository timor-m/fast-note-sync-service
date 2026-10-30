FROM golang:1.26-bookworm AS go-build
WORKDIR /src
ARG VERSION
ARG BUILD_DATE
ARG GIT_COMMIT
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    flags="-s -w -X github.com/haierkeys/fast-note-sync-service/internal/app.GitTag=${GIT_COMMIT:-local} -X github.com/haierkeys/fast-note-sync-service/internal/app.BuildTime=${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    if [ -n "$VERSION" ]; then flags="$flags -X github.com/haierkeys/fast-note-sync-service/internal/app.Version=$VERSION"; fi && \
    CGO_ENABLED=0 go build -trimpath -ldflags "$flags" -o /out/fast-note-sync-service .

FROM node:22-bookworm-slim AS web-build
WORKDIR /app
COPY web/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim
ARG SOURCE_URL=https://github.com/timor-m/fast-note-sync-service
ARG VERSION
ARG BUILD_DATE
ARG GIT_COMMIT
LABEL org.opencontainers.image.title="Fast Note Sync Service" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="${SOURCE_URL}"
ENV TZ=Asia/Shanghai NODE_ENV=production \
    FNS_WEB_FRONTEND_ENABLED=true \
    FNS_WEB_FRONTEND_TARGET=http://127.0.0.1:3000 \
    FNS_API_BASE_URL=http://127.0.0.1:9000 \
    FNS_SESSION_DIR=/fast-note-sync/storage/web-sessions \
    FNS_SESSION_SECURE=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tzdata tini gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /fast-note-sync
COPY --from=go-build /out/fast-note-sync-service ./fast-note-sync-service
COPY --from=web-build --chown=node:node /app/.output ./web/.output
COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh
EXPOSE 9000 9001
VOLUME ["/fast-note-sync/config", "/fast-note-sync/storage"]
# Core health stays independent from Nuxt; /api/frontend/health checks the frontend.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1:9000/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/entrypoint.sh"]
CMD ["run"]
