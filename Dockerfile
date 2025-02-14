# Utiliser une image officielle Node.js
FROM node:18

# Installer OpenSSL pour gérer les certificats SSL
RUN apt-get update && apt-get install -y openssl

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers package.json et package-lock.json (si présent)
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier l'ensemble du code dans le conteneur
COPY . .

# Créer un répertoire pour stocker les certificats
RUN mkdir -p /etc/ssl/private /etc/ssl/certs

# Copier le script de génération SSL
COPY init-ssl.sh /init-ssl.sh
RUN chmod +x /init-ssl.sh

# Exposer le port utilisé par l'application (ici 5000)
EXPOSE 5000

# Démarrer le script d'initialisation puis l'application
CMD ["/bin/bash", "/init-ssl.sh", "node", "index.js"]
