# Use an official Node.js image
FROM node:18

# Install OpenSSL to handle SSL certificates
RUN apt-get update && apt-get install -y openssl

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire application code into the container
COPY . .

# Create directories for storing SSL certificates
RUN mkdir -p /etc/ssl/private /etc/ssl/certs

# Copy the SSL generation script
COPY init-ssl.sh /init-ssl.sh
RUN chmod +x /init-ssl.sh

# Expose the application's port (5000 in this case)
EXPOSE 5000

# Run the SSL initialization script, then start the application
CMD ["/bin/bash", "/init-ssl.sh", "node", "index.js"]
