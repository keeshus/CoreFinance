# Stage 1: Build
FROM node:25-alpine AS builder
WORKDIR /app

# Copy manifests
COPY package*.json ./
COPY worker/package*.json ./worker/
COPY shared/ ./shared/

# Install production dependencies
RUN npm install -w worker --omit=dev && \
    npm cache clean --force

# Stage 2: Production
FROM node:25-alpine
ENV NODE_ENV=production
WORKDIR /app

# Install tini
RUN apk add --no-cache tini

# Copy worker and shared logic
COPY worker/ ./worker/
COPY shared/ ./shared/
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

USER node

# Use tini for signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "worker/index.js"]
