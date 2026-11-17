# syntax=docker/dockerfile:1
# Build: Node 22 + Vite (production flags: real API, no demo login). Run: unprivileged nginx serving the SPA.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# CYPRESS_INSTALL_BINARY=0: the E2E binary is not needed to build the bundle
RUN CYPRESS_INSTALL_BINARY=0 npm ci --ignore-scripts
COPY . .
ARG VITE_MOCK_BACKEND=false
ARG VITE_DEMO_LOGIN=false
ENV VITE_MOCK_BACKEND=${VITE_MOCK_BACKEND} VITE_DEMO_LOGIN=${VITE_DEMO_LOGIN}
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
# /api/* is proxied to the backend (same contract as the Vite dev proxy); override BACKEND_URL at runtime.
# The backend host is resolved per request through the container's DNS (see nginx/default.conf.template), so the
# image starts without a backend; the entrypoint exports NGINX_LOCAL_RESOLVERS when this flag is set.
ENV BACKEND_URL=http://backend:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
