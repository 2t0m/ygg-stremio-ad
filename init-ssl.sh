#!/bin/bash

# Chemins vers les fichiers SSL
KEY_PATH="/etc/ssl/private/server.key"
CERT_PATH="/etc/ssl/certs/server.pem"

# URLs des fichiers
KEY_URL="https://local-ip.sh/server.key"
CERT_URL="https://local-ip.sh/server.pem"

# Vérifier si les fichiers existent déjà
if [ ! -f "$KEY_PATH" ] || [ ! -f "$CERT_PATH" ]; then
    echo "Téléchargement des certificats SSL..."

    # Télécharger les fichiers
    curl -s -o "$KEY_PATH" "$KEY_URL"
    curl -s -o "$CERT_PATH" "$CERT_URL"

    # Vérifier si les fichiers ont bien été téléchargés
    if [ -f "$KEY_PATH" ] && [ -f "$CERT_PATH" ]; then
        echo "Certificats SSL téléchargés avec succès !"

        # Appliquer les bonnes permissions
        chmod 600 "$KEY_PATH"
        chmod 644 "$CERT_PATH"
    else
        echo "❌ Erreur : Impossible de télécharger les certificats SSL."
        exit 1
    fi
else
    echo "✅ Certificat SSL déjà présent, aucune action nécessaire."
fi

# Afficher les fichiers pour debug
ls -l /etc/ssl/certs /etc/ssl/private

# Démarrer l'application avec les arguments fournis
exec "$@"
