# Node 20 Alpine-based Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json for dependency installation
COPY package*.json ./

# Install dependencies in production mode
RUN npm ci --production

# Copy the rest of the application files
COPY . .

# Expose application port
EXPOSE 3000

# Start the application
CMD ["node", "server/server.js"]