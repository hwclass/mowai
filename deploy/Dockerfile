FROM node:22-slim
WORKDIR /app
COPY packages/arena/package*.json ./
RUN npm ci --omit=dev
COPY packages/arena/src ./src
COPY packages/arena-ui ./arena-ui
EXPOSE 8080
CMD ["node", "src/server.mjs"]
