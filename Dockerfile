FROM node:18-slim

# Installer les dépendances pour Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    wget \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste des fichiers de l'application
COPY . .

# Créer le dossier data s'il n'existe pas
RUN mkdir -p ./data

# Exposer le port sur lequel l'app s'exécute
EXPOSE 3000

# Modifier le script pour utiliser le chemin Chromium correct
RUN sed -i 's/puppeteer.launch(/puppeteer.launch({ executablePath: "\/usr\/bin\/chromium", args: ["--no-sandbox"] })/g' index.js

# Commande de démarrage
CMD ["node", "index.js"]
