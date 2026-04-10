FROM node:22-alpine

# Install curl for troubleshooting/consistency
RUN apk add --no-cache curl

WORKDIR /app

# Copy files with correct ownership to avoid heavy chown
COPY --chown=node:node package*.json ./
RUN npm install

COPY --chown=node:node . .

USER node

# Run the worker from its directory
CMD ["node", "worker/index.js"]
