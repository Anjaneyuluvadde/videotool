# --- STAGE 1: Build React/Vite assets ---
FROM node:20-alpine AS build-stage

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy frontend source files
COPY . .

# Build production assets
RUN npm run build

# --- STAGE 2: High-performance Nginx Static Server ---
FROM nginx:1.25-alpine AS production-stage

# Copy compiled SPA assets to nginx standard serving directory
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy standard custom nginx configuration to handle React client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
