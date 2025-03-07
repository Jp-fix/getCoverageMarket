import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Obtenir le répertoire courant en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// Pour accéder aux fichiers via le chemin /cb-scraper/public
app.use('/cb-scraper/public', express.static(path.join(__dirname, 'public')));


// Route pour la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour récupérer la liste des fichiers de résultats
app.get('/api/results', (req, res) => {
  const dataDir = path.join(__dirname, 'data');
  
  // Vérifier si le dossier existe
  if (!fs.existsSync(dataDir)) {
    return res.json({ files: [] });
  }
  
  // Lire les fichiers du dossier
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      console.error('Erreur lors de la lecture du dossier de données:', err);
      return res.status(500).json({ error: 'Erreur lors de la lecture du dossier de données' });
    }
    
    // Filtrer les fichiers JSON
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    // Trier par date de modification (du plus récent au plus ancien)
    const sortedFiles = jsonFiles.map(file => {
      const filePath = path.join(dataDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: `/data/${file}`,
        size: stats.size,
        modified: stats.mtime
      };
    }).sort((a, b) => b.modified - a.modified);
    
    res.json({ files: sortedFiles });
  });
});

// Variable pour stocker le processus de scraping
let scrapingProcess = null;

// Fonction pour classifier le type de message
function classifyMessageType(message) {
  if (message.includes('ERREUR') || message.includes('Échec') || message.includes('erreur')) {
    return 'error';
  } else if (message.includes('Attention') || message.includes('attention') || message.includes('WARNING')) {
    return 'warning';
  } else if (message.includes('terminé avec succès') || message.includes('sauvegardés') || message.includes('succès') || message.includes('✅')) {
    return 'success';
  } else if (message.includes('Navigation') || message.includes('chargée') || message.includes('Traitement') || message.includes('Récupér') || message.includes('ℹ️')) {
    return 'info';
  }
  return '';
}

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
  console.log('Nouvelle connexion client');
  
  // Événement pour démarrer le scraping
  socket.on('start-scraping', () => {
    console.log('Démarrage du scraping...');
    
    // Vérifier si un script est déjà en cours d'exécution
    if (scrapingProcess && !scrapingProcess.killed) {
      socket.emit('log', 'Un processus de scraping est déjà en cours...');
      return;
    }
    
    // Créer le dossier data s'il n'existe pas
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Lancer le script de scraping
    const scriptPath = path.join(__dirname, 'scraper.js');
    scrapingProcess = spawn('node', [scriptPath]);
    
    socket.emit('scraping-started');
    
    // Rediriger les sorties du script vers le socket
    scrapingProcess.stdout.on('data', (data) => {
      const logMessage = data.toString();
      console.log(logMessage);
      
      // Vérifier si c'est un message de statistiques
      if (logMessage.includes('SCRAPER_STATS:')) {
        try {
          // Extraire et parser les statistiques JSON
          const statsMatch = logMessage.match(/SCRAPER_STATS: (.+)/);
          if (statsMatch && statsMatch[1]) {
            const stats = JSON.parse(statsMatch[1]);
            console.log("Envoi des statistiques au frontend:", stats);
            
            // Envoyer les statistiques au frontend
            io.emit('scraper-stats', stats);
          }
        } catch (error) {
          console.error('Erreur lors du traitement des statistiques:', error);
        }
      }
      else {
        // Analyser les messages de progression standard
        if (logMessage.includes('produits trouvés sur la page')) {
          const match = logMessage.match(/(\d+) produits trouvés/);
          if (match) {
            io.emit('scraper-stats', { 
              productsFound: parseInt(match[1]),
              productsCount: null  // Sera mis à jour par le message SCRAPER_STATS
            });
          }
        } 
        else if (logMessage.includes('Traitement de')) {
          const match = logMessage.match(/\[(\d+)\/(\d+)\]/);
          if (match) {
            const currentIndex = parseInt(match[1]);
            const total = parseInt(match[2]);
            const progress = Math.round((currentIndex / total) * 100);
            
            io.emit('scraper-stats', { 
              progress: progress,
              currentIndex: currentIndex,
              totalProducts: total
            });
          }
        }
      }
      
      // Déterminer le type de message pour le styling côté client
      const messageType = classifyMessageType(logMessage);
      
      // Envoyer aussi le message de log normal
      socket.emit('log', logMessage, messageType);
      io.emit('progress-update', logMessage);
    });
    
    scrapingProcess.stderr.on('data', (data) => {
      const errorMessage = data.toString();
      console.error(errorMessage);
      socket.emit('log', `ERREUR: ${errorMessage}`, 'error');
    });
    
    scrapingProcess.on('close', (code) => {
      console.log(`Le processus de scraping s'est terminé avec le code: ${code}`);
      socket.emit('log', `Le processus de scraping s'est terminé avec le code: ${code}`, code === 0 ? 'success' : 'error');
      socket.emit('scraping-completed', { code });
      io.emit('scraping-completed', { code });
    });
  });
  
  // Événement pour arrêter le scraping
  socket.on('stop-scraping', () => {
    if (scrapingProcess && !scrapingProcess.killed) {
      scrapingProcess.kill();
      socket.emit('log', 'Le processus de scraping a été arrêté.', 'warning');
      socket.emit('scraping-stopped');
      io.emit('scraping-stopped');
    } else {
      socket.emit('log', 'Aucun processus de scraping en cours.', 'info');
    }
  });
  
  // Envoyer les statistiques actuelles au nouveau client qui se connecte
  socket.on('get-current-stats', () => {
    if (scrapingProcess && !scrapingProcess.killed) {
      // Si un scraping est en cours, essayez de récupérer l'état actuel
      // Ceci pourrait être étendu pour lire les fichiers intermédiaires si nécessaire
      try {
        const currentResultsPath = path.join(__dirname, 'data', 'results_current.json');
        if (fs.existsSync(currentResultsPath)) {
          const currentResults = JSON.parse(fs.readFileSync(currentResultsPath, 'utf8'));
          socket.emit('scraper-stats', {
            productsCount: currentResults.products.length,
            offersCount: currentResults.products.length,
            avgPrice: currentResults.metadata.stats.avgPrice || 0,
            vendors: currentResults.metadata.vendors || [],
            grades: currentResults.metadata.grades || [],
            colors: currentResults.metadata.couleurs || []
          });
        }
      } catch (error) {
        console.error('Erreur lors de la récupération des statistiques actuelles:', error);
      }
    } else {
      // Si aucun scraping n'est en cours, vérifier s'il y a des résultats récents
      try {
        const latestResultsPath = path.join(__dirname, 'data', 'combak_latest_results.json');
        if (fs.existsSync(latestResultsPath)) {
          const latestResults = JSON.parse(fs.readFileSync(latestResultsPath, 'utf8'));
          socket.emit('scraper-stats', {
            productsCount: latestResults.products.length,
            offersCount: latestResults.products.length,
            avgPrice: latestResults.metadata.stats.avgPrice || 0,
            vendors: latestResults.metadata.vendors || [],
            grades: latestResults.metadata.grades || [],
            colors: latestResults.metadata.couleurs || [],
            marketCoverage: latestResults.metadata.marketCoverage?.percentage || 0
          });
        }
      } catch (error) {
        console.error('Erreur lors de la récupération des derniers résultats:', error);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client déconnecté');
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`Ouvrez votre navigateur sur http://localhost:${PORT}`);
});