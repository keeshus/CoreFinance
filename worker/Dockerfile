FROM node:22-alpine

# Install curl for troubleshooting/consistency
RUN apk add --no-cache curl

WORKDIR /app

# Copy package.json from root to get dependencies for both parts
COPY package*.json ./
RUN npm install

# Copy the entire project to ensure shared/ is available
COPY . .

# Run the worker from its directory
CMD ["node", "worker/index.js"]
