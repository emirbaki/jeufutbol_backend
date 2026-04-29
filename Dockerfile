# Use the official Node.js image as the base image
FROM node:22-slim

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
# Copy patches directory so patch-package can apply them during postinstall
COPY patches ./patches/

# Install the application dependencies
RUN npm install --legacy-peer-deps


# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE 3001

# Command to run the application
CMD ["sh", "-c", "npm run migration:run && node dist/main"]