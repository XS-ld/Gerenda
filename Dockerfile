FROM node:20-alpine

WORKDIR /app

# 零第三方依赖，只复制源码
COPY package.json ./
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server.js"]
