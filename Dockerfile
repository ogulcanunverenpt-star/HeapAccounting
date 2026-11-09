FROM node:22-bookworm-slim AS frontend
RUN apt-get update && apt-get install -y --no-install-recommends clang lld \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /frontend
COPY src/serverroot/package*.json ./
RUN npm ci
COPY src/serverroot/ ./
RUN npm run build

FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY src/ ./
RUN make

FROM debian:bookworm-slim
RUN useradd --system --no-create-home --uid 10001 webserver
WORKDIR /app
COPY --from=build /build/server /app/server
COPY --from=frontend /frontend/dist /app/serverroot/dist
COPY --from=build /build/serverfiles /app/serverfiles
USER webserver
EXPOSE 3490
CMD ["./server"]
