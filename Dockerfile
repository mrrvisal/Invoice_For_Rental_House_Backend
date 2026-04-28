# Use official Node.js 20 Alpine image (lightweight)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (production only for smaller image)
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory for Multer
RUN mkdir -p uploads

# Expose the port the app runs on
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start the server
CMD ["node", "server.js"]

