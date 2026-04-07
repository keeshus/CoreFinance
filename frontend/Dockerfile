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

# Copy built frontend assets and configuration
COPY --from=builder /app/frontend ./frontend
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# Run frontend production server
CMD ["npm", "run", "frontend:start"]
