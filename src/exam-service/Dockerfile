FROM node:22-bookworm-slim
WORKDIR /app/exam-service
COPY src/exam-service/package*.json ./
RUN npm ci --omit=dev
COPY src/exam-service/*.js src/exam-service/*.sql ./
COPY src/exam-service/examples ./examples
COPY src/serverroot/package.json /app/serverroot/package.json
COPY src/serverroot/src/game /app/serverroot/src/game
COPY src/serverroot/src/accounting /app/serverroot/src/accounting
RUN mkdir -p /app/exam-service/data && chown node:node /app/exam-service/data
USER node
ENV HOST=0.0.0.0
EXPOSE 3491
CMD ["node", "server.js"]
