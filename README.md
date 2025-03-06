# Combak Scraper - Interface Web

Cette application permet de scraper le site Combak pour récupérer les données sur les smartphones reconditionnés et leurs offres associées. L'interface web permet de lancer le scraping, de suivre son avancement en temps réel et de télécharger les résultats au format JSON.

## Fonctionnalités

- Interface web conviviale pour contrôler le scraping
- Affichage en temps réel des logs et de la progression
- Statistiques sur les produits et offres récupérés
- Téléchargement des fichiers de résultats
- Historique des scrapings précédents

## Installation

### Prérequis

- Node.js (v16 ou supérieur)
- NPM ou Yarn

### Étapes d'installation

1. Clonez ce dépôt ou téléchargez les fichiers
2. Installez les dépendances :

```bash
npm install
```

## Utilisation

### Démarrer le serveur

```bash
npm start
```

Cela lancera le serveur sur le port 3000 par défaut. Vous pouvez changer le port en définissant la variable d'environnement `PORT` :

```bash
PORT=8080 npm start
```

### Accéder à l'interface web

Ouvrez votre navigateur et accédez à :

```
http://localhost:3000
```

### Utilisation de l'interface

1. Cliquez sur le bouton "Lancer le scraping" pour démarrer le processus
2. Suivez l'avancement en temps réel dans la console
3. Consultez les statistiques à droite de l'écran
4. Une fois terminé, les fichiers de résultats apparaîtront dans la section "Résultats disponibles"
5. Cliquez sur "Télécharger" pour récupérer le fichier JSON des résultats

## Structure du projet

- `server.cjs` - Serveur Express et gestionnaire de WebSockets
- `scraper.js` - Script de scraping Puppeteer
- `public/index.html` - Interface web
- `data/` - Dossier où sont stockés les résultats

## Format des données

Les données sont sauvegardées au format JSON avec la structure suivante :

```json
{
  "metadata": {
    "lastUpdate": "2024-03-06T12:00:00.000Z",
    "vendors": ["Vendeur1", "Vendeur2", ...],
    "grades": ["MINT", "VERY_GOOD", "GOOD", "FAIR"],
    "marques": ["Apple", "Samsung", ...],
    "capacites": [64, 128, 256, ...],
    "couleurs": ["Noir", "Bleu", ...],
    "stats": {
      "totalProducts": 42,
      "inStock": 35,
      "outOfStock": 7,
      "avgPrice": 650,
      "totalValue": 22750
    },
    ...
  },
  "products": [
    {
      "sku": "APL-IP15-128-MINT-BLK",
      "Marque": "Apple",
      "Modele": "iPhone 15",
      "Couleur": "Noir",
      "Capacite": 128,
      "Grade": "MINT",
      "Prix": 899,
      "Prix_reference": 1079,
      "Quantity": 3,
      "Nom vendeur": "Vendeur1",
      "Status": "validated",
      "URL": "https://www.combak.co/smartphone/apple/iphone-15-..."
    },
    ...
  ]
}
```

## Personnalisation

Vous pouvez personnaliser différents aspects du script de scraping :

- Modification du nombre de produits à traiter dans `scraper.js`
- Ajout de champs supplémentaires à extraire
- Changement du format de sortie

## Dépannage

### Le script de scraping ne démarre pas

- Vérifiez que toutes les dépendances sont installées
- Assurez-vous que Node.js est à jour
- Vérifiez les logs dans la console du terminal

### Les pages ne se chargent pas correctement

- Le site Combak peut avoir changé sa structure HTML
- Vérifiez les sélecteurs CSS dans le script de scraping
- Augmentez les temps d'attente pour le chargement des pages

### Erreur "Protocol error"

Ce type d'erreur peut survenir lorsque Puppeteer essaie d'accéder à une ressource qui n'est plus disponible (par exemple, une page a été fermée). Ce n'est généralement pas grave si cela se produit à la fin du processus.

## Licence

Ce projet est fourni tel quel, sans garantie. Vous êtes libre de le modifier et de l'utiliser selon vos besoins.