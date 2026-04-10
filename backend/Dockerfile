# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Copy package.json from root
COPY package*.json ./
RUN npm install

# Copy everything
COPY . .

# Production stage
FROM node:25-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy only the backend and shared infra with correct ownership
COPY --from=builder --chown=node:node /app/backend ./backend
COPY --from=builder --chown=node:node /app/shared ./shared
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000

# Run backend
CMD ["node", "backend/index.js"]
