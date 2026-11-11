FROM node:22.20.0-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY shared/package.json shared/
RUN npm install
COPY client client
COPY shared shared
RUN npm run build --workspace shared && npm run build --workspace client

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
