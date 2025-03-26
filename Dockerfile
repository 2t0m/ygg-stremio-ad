# Use an official Node.js image
FROM node:18

# Install OpenSSL to manage SSL certificates
RUN apt-get update && apt-get install -y openssl

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire application code into the container
COPY . .

# Create a directory to store the certificates
RUN mkdir -p /etc/ssl/private /etc/ssl/certs

# Copy the SSL initialization script
COPY init-ssl.sh /init-ssl.sh
RUN chmod +x /init-ssl.sh

# Expose the port used by the application (here, 5000)
EXPOSE 5000

# Run the initialization script and then start the application
CMD ["/bin/bash", "/init-ssl.sh", "node", "index.js"]