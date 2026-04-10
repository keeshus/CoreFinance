# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Copy package.json from root
COPY package*.json ./
RUN npm install

# Copy everything and build
COPY . .
RUN npm run frontend:build

# Production stage
FROM node:25-alpine

# Install curl for troubleshooting/consistency
RUN apk add --no-cache curl

WORKDIR /app

# Copy built frontend assets and configuration with correct ownership
COPY --from=builder --chown=node:node /app/frontend ./frontend
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000

# Run frontend production server
CMD ["npm", "run", "frontend:start"]
