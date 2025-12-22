FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Create deployments directory
RUN mkdir -p deployments

# Make entrypoint executable
RUN chmod +x docker/entrypoint.sh

# Expose Hardhat node port
EXPOSE 8545

# Run entrypoint script
CMD ["sh", "./docker/entrypoint.sh"]
