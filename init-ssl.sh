#!/bin/bash

# Paths to SSL files
KEY_PATH="/etc/ssl/private/server.key"
CERT_PATH="/etc/ssl/certs/server.pem"

# URLs of the files
KEY_URL="https://local-ip.sh/server.key"
CERT_URL="https://local-ip.sh/server.pem"

# Check if the files already exist
if [ ! -f "$KEY_PATH" ] || [ ! -f "$CERT_PATH" ]; then
    echo "Downloading SSL certificates..."

    # Download the files
    curl -s -o "$KEY_PATH" "$KEY_URL"
    curl -s -o "$CERT_PATH" "$CERT_URL"

    # Verify if the files were successfully downloaded
    if [ -f "$KEY_PATH" ] && [ -f "$CERT_PATH" ]; then
        echo "SSL certificates downloaded successfully!"

        # Apply proper permissions
        chmod 600 "$KEY_PATH"
        chmod 644 "$CERT_PATH"
    else
        echo "❌ Error: Failed to download SSL certificates."
        exit 1
    fi
else
    echo "✅ SSL certificate already exists, no action required."
fi

# Start the application with the provided arguments
exec "$@"