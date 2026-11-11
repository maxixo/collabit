FROM node:22.20.0-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm install
COPY server server
COPY shared shared
RUN npm run build --workspace shared && npm run build --workspace server
EXPOSE 4000
CMD ["node", "server/dist/server.js"]
