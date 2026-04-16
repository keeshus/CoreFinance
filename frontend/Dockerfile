# Stage 1: Build
FROM node:25-alpine AS builder
WORKDIR /app

# Copy workspace configs
COPY package*.json ./
COPY frontend/package*.json ./frontend/
# Install build dependencies
RUN npm install -w frontend && \
    npm cache clean --force

# Copy source and build
COPY frontend/ ./frontend/
# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w frontend

# Stage 2: Production
FROM node:25-alpine
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Install curl for healthcheck and tini
RUN apk add --no-cache curl tini

# Copy only necessary files for production
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/package*.json ./frontend/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

USER node
EXPOSE 3000

# Use tini for signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "frontend:start"]
