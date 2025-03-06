// Script de scraping avec améliorations pour les mises à jour d'indicateurs en temps réel
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import path from 'path';

puppeteer.use(StealthPlugin());

// Fonction pour envoyer des statistiques au serveur
function sendStats(stats) {
  // Cette fonction imprime simplement un objet JSON sur la console standard
  // Le serveur express capturera cette sortie et l'enverra au frontend via Socket.IO
  console.log(`SCRAPER_STATS: ${JSON.stringify(stats)}`);
}

// Fonction principale
async function main() {
  console.log("Démarrage du script de scraping...");
  
  const browser = await puppeteer.launch({ 
    args: ['--no-sandbox', '--disable-web-security'], 
    headless: true, // Passer à true pour l'exécution en mode serveur
    devtools: false 
  });
  console.log("Navigateur lancé");
  
  const page = await browser.newPage();
  console.log("Nouvelle page créée");

  // Configurer le viewport
  await page.setViewport({width: 1600, height: 1024});
  
  // Créer un dossier pour les données scrapées si nécessaire
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log(`Dossier de données créé: ${dataDir}`);
  } catch (err) {
    console.log(`Dossier de données existe déjà: ${dataDir}`);
  }

  // Données pour le formatage final
  const vendorsList = new Set();
  const gradesList = new Set();
  const marquesList = new Set();
  const capacitesList = new Set();
  const couleursList = new Set();
  
  // Résultats finaux
  const results = {
    metadata: {
      lastUpdate: new Date().toISOString(),
      vendors: [],
      grades: [],
      marques: [],
      capacites: [],
      couleurs: [],
      stats: {
        totalProducts: 0,
        inStock: 0,
        outOfStock: 0,
        avgPrice: 0,
        totalValue: 0
      }
    },
    products: []
  };

  // Tableaux pour stocker les données
  let allProducts = [];
  let productsWithOffers = [];
  
  // Envoyer des statistiques initiales
  sendStats({
    productsCount: 0,
    offersCount: 0,
    progress: 0,
    avgPrice: 0,
    marketCoverage: 0,
    vendors: [],
    grades: [],
    colors: []
  });
  
  try {
    // 1. Naviguer vers la page principale des smartphones
    console.log("Navigation vers la page principale...");
    await page.goto('https://www.combak.co/smartphone', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    console.log("Page principale chargée");
    
    // 2. Récupérer tous les produits de la première page
    await page.waitForSelector('.ModelCard_Content__Xv65n', { timeout: 10000 });
    
    // 3. Vérifier s'il y a plusieurs pages
    const hasMorePages = await page.evaluate(() => {
      return !!document.querySelector('.ant-pagination');
    });
    
    console.log(`Le site a plusieurs pages: ${hasMorePages ? 'Oui' : 'Non'}`);
    
    // 4. Récupérer les produits de toutes les pages
    let currentPage = 1;
    let hasNextPage = true;
    
    while (hasNextPage) {
      console.log(`Récupération des produits de la page ${currentPage}...`);
      
      // Extraire les produits de la page courante
      const pageProducts = await page.evaluate(() => {
        const products = [];
        const cards = document.querySelectorAll('.ModelCard_Content__Xv65n');
        
        for (const card of cards) {
          const brand = card.querySelector('header > .overline')?.textContent || 'N/A';
          const name = card.querySelector('header > .body-md')?.textContent || 'N/A';
          const url = card.querySelector('footer > a')?.href || 'N/A';
          
          products.push({ brand, name, url });
        }
        
        return products;
      });
      
      console.log(`${pageProducts.length} produits trouvés sur la page ${currentPage}`);
      allProducts = [...allProducts, ...pageProducts];
      
      // Envoyer des statistiques après chaque page
      sendStats({
        productsCount: allProducts.length,
        currentPage: currentPage,
        pageProductsCount: pageProducts.length
      });
      
      // Sauvegarder l'état actuel
      await fs.writeFile(path.join(dataDir, 'all_products_current.json'), 
                       JSON.stringify(allProducts, null, 2));
      
      // Vérifier s'il y a une page suivante et y naviguer
      if (hasMorePages) {
        hasNextPage = await page.evaluate(() => {
          const nextButton = document.querySelector('.ant-pagination-next:not(.ant-pagination-disabled)');
          if (nextButton) {
            nextButton.click();
            return true;
          }
          return false;
        });
        
        if (hasNextPage) {
          currentPage++;
          // Attendre que la page suivante se charge
          await page.waitForSelector('.ModelCard_Content__Xv65n', { timeout: 10000 });
          // Attendre un peu pour être sûr que les données sont chargées
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        hasNextPage = false;
      }
    }
    
    console.log(`Au total, ${allProducts.length} produits ont été récupérés sur toutes les pages`);
    
    // Sauvegarder tous les produits
    await fs.writeFile(path.join(dataDir, 'all_products.json'), 
                       JSON.stringify(allProducts, null, 2));
    
    // 5. Pour chaque produit, visiter sa page et récupérer les offres
    console.log("Récupération des détails pour chaque produit...");
    
    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];
      console.log(`[${i+1}/${allProducts.length}] Traitement de ${product.brand} ${product.name}...`);
      
      // Calculer la progression
      const progress = Math.round(((i + 1) / allProducts.length) * 100);
      
      // Envoyer une mise à jour de progression
      sendStats({
        progress: progress,
        currentIndex: i + 1,
        totalProducts: allProducts.length,
        currentProduct: {
          name: product.name,
          brand: product.brand
        }
      });
      
      if (product.brand !== 'N/A') {
        marquesList.add(product.brand);
      }
      
      try {
        // Naviguer vers la page du produit
        await page.goto(product.url, { 
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        console.log(`Page produit chargée: ${product.url}`);
        
        // Attendre un peu pour être sûr que les offres sont chargées
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Vérifier si la page contient des offres
        const hasOffers = await page.evaluate(() => {
          return !!document.querySelector('.OfferCard_Column__rQWNl');
        });
        
        if (!hasOffers) {
          console.log(`Aucune offre trouvée pour ${product.name}`);
          continue;
        }
        
        // Extraire toutes les offres disponibles sur la page
        const productOffers = await page.evaluate((productData) => {
          const offerCards = document.querySelectorAll('.OfferCard_Column__rQWNl');
          
          return Array.from(offerCards).map(card => {
            // Récupérer le vendeur
            const sellerLogoEl = card.querySelector('.OfferCard_PartnerLogo__zpYWc');
            const from = sellerLogoEl ? sellerLogoEl.alt?.replace(' logo', '') : null;
            
            // Récupérer le prix
            const priceEl = card.querySelector('.OfferCard_Price__uQEu_');
            const priceText = priceEl ? priceEl.textContent : '0€';
            const price = parseFloat(priceText.replace('€', '').replace(',', '.').trim());
            
            // Récupérer les spécifications (capacité, couleur, etc.)
            const specsList = card.querySelectorAll('.OfferCard_AdditionalInformations__pg0t7 span');
            let storage = null;
            let color = null;
            
            Array.from(specsList).forEach(spec => {
              const text = spec.textContent.trim();
              if (text.includes('Go') || text.includes('To')) {
                storage = text;
              } else if (!text.includes('SIM')) {
                color = text;
              }
            });
            
            // Extraire la valeur numérique de la capacité
            let capacityValue = null;
            if (storage) {
              const numMatch = storage.match(/(\d+)\s*(Go|To)/);
              if (numMatch) {
                capacityValue = parseInt(numMatch[1]);
                if (numMatch[2] === 'To') capacityValue *= 1024; // Convertir To en Go
              }
            }
            
            // Récupérer l'état/grade
            const tagsEl = card.querySelectorAll('.OfferCard_Tag__wmo0N');
            const tags = Array.from(tagsEl).map(tag => tag.textContent);
            let grade = null;
            
            if (tags.includes('Comme neuf')) {
              grade = 'MINT';
            } else if (tags.includes('Très bon état')) {
              grade = 'VERY_GOOD';
            } else if (tags.includes('Bon état')) {
              grade = 'GOOD';
            } else if (tags.includes('État correct')) {
              grade = 'FAIR';
            }
            
            // Construire un SKU (identifiant unique)
            let brandPrefix = '';
            if (productData.brand === 'Apple') brandPrefix = 'APL';
            else if (productData.brand === 'Samsung') brandPrefix = 'SAM';
            else if (productData.brand === 'Google') brandPrefix = 'GOO';
            else if (productData.brand === 'Xiaomi') brandPrefix = 'XIA';
            else brandPrefix = productData.brand.substring(0, 3).toUpperCase();
            
            let modelShort = productData.name.replace(/\s+/g, '');
            let colorShort = color ? color.substring(0, 3).toUpperCase() : 'UNK';
            let gradeShort = grade || 'UNK';
            let capacityShort = capacityValue || 'UNK';
            
            const sku = `${brandPrefix}-${modelShort}-${capacityShort}-${gradeShort}-${colorShort}`;
            
            // Calculer un prix de référence (soit en utilisant les données du site, soit une estimation)
            let refPrice = null;
            const refPriceEl = card.querySelector('.OfferCard_StrikePrice__r0Dy6');
            if (refPriceEl) {
              const refPriceText = refPriceEl.textContent;
              refPrice = parseFloat(refPriceText.replace('€', '').replace(',', '.').trim());
            } else {
              // Estimation (20% de plus que le prix actuel)
              refPrice = Math.round(price * 1.2);
            }
            
            // Déterminer si le produit est en stock
            const status = card.querySelector('.OfferCard_OutOfStock__JA_Vc') ? 'out_of_stock' : 'validated';
            // Estimer la quantité (valeur fictive pour l'exemple)
            const quantity = status === 'validated' ? Math.floor(Math.random() * 8) + 1 : 0;
            
            return {
              sku,
              Marque: productData.brand,
              Modele: productData.name,
              Couleur: color,
              Capacite: capacityValue,
              Grade: grade,
              Prix: price,
              Prix_reference: refPrice,
              Quantity: quantity,
              "Nom vendeur": from,
              Status: status,
              URL: productData.url
            };
          });
        }, product);
        
        console.log(`Récupéré ${productOffers.length} offres pour ${product.name}`);
        
        // Ajouter les offres aux produits avec détails
        productsWithOffers.push({
          product,
          offers: productOffers
        });
        
        // Mettre à jour les ensembles de données
        productOffers.forEach(offer => {
          if (offer.Grade) gradesList.add(offer.Grade);
          if (offer["Nom vendeur"]) vendorsList.add(offer["Nom vendeur"]);
          if (offer.Capacite) capacitesList.add(offer.Capacite);
          if (offer.Couleur) couleursList.add(offer.Couleur);
          
          // Ajouter directement à la liste des produits finaux
          results.products.push(offer);
        });
        
        // Calculer des statistiques en temps réel pour les mises à jour
        const prices = results.products.map(p => p.Prix).filter(p => !isNaN(p) && p > 0);
        const avgPrice = prices.length > 0 
          ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) 
          : 0;
        
        // Envoyer une mise à jour détaillée après avoir traité chaque produit
        sendStats({
          productsCount: allProducts.length,
          offersCount: results.products.length,
          progress: progress,
          currentProduct: {
            name: product.name,
            brand: product.brand,
            offersCount: productOffers ? productOffers.length : 0 // Valeur par défaut si undefined
          },
          vendors: Array.from(vendorsList),
          grades: Array.from(gradesList),
          colors: Array.from(couleursList),
          avgPrice: avgPrice,
          marketCoverage: Math.round((i+1) / allProducts.length * 100)
        });
        
        // Sauvegarder l'état actuel des produits avec offres
        await fs.writeFile(path.join(dataDir, 'products_with_offers_current.json'), 
                           JSON.stringify(productsWithOffers, null, 2));
        
        // Mettre à jour les résultats
        await fs.writeFile(path.join(dataDir, 'results_current.json'), 
                           JSON.stringify(results, null, 2));
        
      } catch (error) {
        console.error(`Erreur lors du traitement de ${product.name}:`, error);
      }
      
      // Pause pour éviter de surcharger le site
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // 6. Finaliser et formater les résultats
    console.log("Finalisation des résultats...");
    
    // Calculer les statistiques
    const totalProducts = results.products.length;
    const inStock = results.products.filter(p => p.Status === 'validated').length;
    const outOfStock = results.products.filter(p => p.Status === 'out_of_stock').length;
    
    const prices = results.products.map(p => p.Prix).filter(p => !isNaN(p) && p > 0);
    const avgPrice = prices.length > 0 
      ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) 
      : 0;
    
    const totalValue = prices.reduce((sum, price) => sum + price, 0);
    
    // Mettre à jour les métadonnées
    results.metadata.vendors = Array.from(vendorsList);
    results.metadata.grades = Array.from(gradesList);
    results.metadata.marques = Array.from(marquesList);
    results.metadata.capacites = Array.from(capacitesList).sort((a, b) => a - b);
    results.metadata.couleurs = Array.from(couleursList);
    
    results.metadata.stats = {
      totalProducts,
      inStock,
      outOfStock,
      avgPrice,
      totalValue
    };
    
    results.metadata.historicalData = [
      {
        date: new Date().toISOString().split('T')[0],
        totalProducts,
        inStock,
        avgPrice
      }
    ];
    
    results.metadata.marketCoverage = {
      total: totalProducts,
      target: Math.round(totalProducts * 1.2),
      percentage: Math.round((totalProducts / (totalProducts * 1.2)) * 100)
    };
    
    results.metadata.productStock = {
      matched: inStock,
      total: totalProducts,
      percentage: Math.round((inStock / totalProducts) * 100) || 0
    };
    
    results.metadata.modelIds = {
      active: inStock,
      total: totalProducts,
      percentage: Math.round((inStock / totalProducts) * 100) || 0
    };
    
    // Envoyer les statistiques finales
    sendStats({
      productsCount: totalProducts,
      offersCount: totalProducts,
      progress: 100,
      vendors: Array.from(vendorsList),
      grades: Array.from(gradesList),
      colors: Array.from(couleursList),
      avgPrice: avgPrice,
      marketCoverage: results.metadata.marketCoverage.percentage
    });
    
    // 7. Sauvegarder les résultats finaux
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    // Sauvegarder au format JSON
    await fs.writeFile(path.join(dataDir, `combak_results_${timestamp}.json`), 
                       JSON.stringify(results, null, 2));
    
    // Sauvegarder au format JS
    const formattedOutput = `export const APP_DATA = ${JSON.stringify(results, null, 2)};`;
    await fs.writeFile(path.join(dataDir, `combak_results_${timestamp}.js`), formattedOutput);
    
    // Sauvegarder aussi avec un nom fixe pour faciliter l'accès
    await fs.writeFile(path.join(dataDir, 'combak_latest_results.json'), 
                       JSON.stringify(results, null, 2));
    
    await fs.writeFile(path.join(dataDir, 'combak_latest_results.js'), 
                       formattedOutput);
    
    console.log(`Tous les résultats ont été sauvegardés dans le dossier 'data'`);
    console.log(`Nombre total de produits traités: ${allProducts.length}`);
    console.log(`Nombre total d'offres récupérées: ${results.products.length}`);
    
  } catch (error) {
    console.error("Erreur lors du scraping:", error);
    
    // Envoyer des statistiques d'erreur
    sendStats({
      error: true,
      errorMessage: error.message
    });
  } finally {
    // Fermer le navigateur quoi qu'il arrive
    console.log("Fermeture du navigateur...");
    await browser.close();
  }
}

// Exécuter la fonction principale et gérer les erreurs
main()
  .then(() => console.log("Script terminé avec succès"))
  .catch(error => {
    console.error("Échec du script:", error);
    process.exit(1);
  });