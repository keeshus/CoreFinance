# Stage 1: Build
FROM node:25-alpine AS builder
WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/

# Install ONLY production dependencies for the backend
RUN npm install -w backend --omit=dev && \
    npm cache clean --force

# Stage 2: Production
FROM node:25-alpine
# Set production environment
ENV NODE_ENV=production
WORKDIR /app

# Install curl for healthcheck and tini for init
RUN apk add --no-cache curl tini

# Copy backend code and shared infra (Read-Only by default)
COPY backend/ ./backend/
COPY shared/ ./shared/
# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
# Copy package manifests for workspace resolution
COPY package*.json ./

USER node
EXPOSE 3000

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/index.js"]
