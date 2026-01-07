# Spécification technique — Génération du PDF A4 imprimable (Google Apps Script)

## 1. Contexte

L’application est une Progressive Web App (PWA) mobile-first utilisée en orientation portrait.

Architecture existante :
- Frontend : PWA
- Backend : Google Apps Script
- Stockage :
  - Google Drive pour les images finales et les PDFs
  - Google Sheets pour les métadonnées des articles

Chaque article correspond à une ligne Google Sheets contenant :
- id (unique)
- date_creation (date + heure, Europe/Paris)
- date_modification (date + heure, Europe/Paris)
- auteur
- texte (0 à 300 caractères)
- image_url (fichier Drive de l’image finale)

Le tri et l’affichage sont basés exclusivement sur date_modification.

Volume attendu :
- 150 à 400 articles par an
- Génération PDF pouvant durer plusieurs dizaines de secondes

---

## 2. Objectif de la fonctionnalité

Implémenter une fonctionnalité « Générer le livre annuel » qui :
- demande une date de début et une date de fin,
- récupère tous les articles dont date_modification est comprise dans la plage (bornes incluses),
- génère un PDF A4 imprimable structuré par mois,
- ajoute une page de garde et des intercalaires mensuels,
- date et versionne automatiquement le PDF,
- stocke le PDF dans le dossier Drive annuel correspondant.

Le PDF est destiné à l’impression d’un livre A4.

---

## 3. Paramètres par défaut

- Date de début par défaut : 1er janvier de l’année précédente
- Date de fin par défaut : 31 décembre de l’année précédente
- Fuseau horaire : Europe/Paris
- Langue : français (y compris noms des mois)

---

## 4. Organisation Drive et versioning

Arborescence cible :

/Appli/  
  /YYYY/  
    /pdf/

Règles :
- Le PDF est stocké dans le dossier pdf de l’année couverte
- Toutes les versions sont conservées
- Aucun nettoyage automatique

Nommage du fichier :

Livre_2025_20250101-20251231_gen-20260110_143522_v03.pdf

Le nom inclut :
- l’année couverte
- la plage de dates
- la date et l’heure de génération
- un numéro de version incrémental

---

## 5. Structure globale du PDF

Ordre des pages :
1. Page de garde
2. Pages intercalaires mensuelles (janvier à décembre)
3. Pages de contenu

Les intercalaires sont toujours présents, même pour les mois sans article.

---

## 6. Page de garde

Format A4.

Contenu :
- Titre centré : « Livre de l’année 2025 »
- Logo
- Mosaïque de photos :
  - inclure autant que possible toutes les images des articles sélectionnés,
  - privilégier la quantité à la taille,
  - images petites mais nettes à l’impression.

Contraintes :
- Utiliser les images finales (assemblées ou simples)
- Disposition en grille adaptative
- Aucune légende

---

## 7. Pages intercalaires mensuelles

- Une page par mois
- Nom du mois en français (ex : « Mars 2025 »)
- Style simple, esthétique, aéré
- Aucun article sur ces pages

Un mois sans article possède son intercalaire suivi de zéro page de contenu.

---

## 8. Pages de contenu

Règles générales :
- Format A4
- Marges adaptées à l’impression
- Pagination continue
- Encadré obligatoire pour chaque article

Répartition :
- 2 articles par page par défaut
- Option « pleine page » possible par article
- Si nombre impair d’articles :
  - la dernière page conserve un espace vide,
  - aucun réarrangement automatique.

---

## 9. Mise en page des articles

Encadré :
- Bordure visible et constante
- Marges internes suffisantes
- Toujours présent

Texte :
- Texte centré
- Police unique
- Taille approximative : 16 pt
- Longueur maximale : 300 caractères

Métadonnées :
- Auteur
- Date basée sur date_modification
- Présentation discrète

Images :
- Images récupérées depuis Google Drive via image_url
- Compatibilité avec formats photo iPhone

Cas 2 articles par page :
- Photo paysage :
  - image en haut
  - texte en dessous
  - métadonnées en bas
- Photo portrait :
  - image centrée
  - adaptation stricte au demi A4
  - respect des marges

Cas 1 article par page (pleine page) :
- Photo portrait privilégiée
- Image plus grande
- Mise en page aérée

---

## 10. Pagination

- Toutes les pages sont numérotées
- Numéro en bas de page
- Police petite
- La couverture et les intercalaires sont inclus dans la pagination

---

## 11. Qualité d’impression

- Qualité maximale raisonnable
- Images les plus nettes possibles
- Compression limitée
- Marges compatibles impression A4
- Aucune dépendance à un service payant

---

## 12. Implémentation technique (Google Apps Script)

Lecture des articles :
- Lecture depuis Google Sheets
- Filtrage sur date_modification
- Bornes incluses
- Conversion explicite en fuseau Europe/Paris

Regroupement :
- Regroupement par mois basé sur date_modification
- Génération des noms de mois en français
- Conservation des mois sans article

Approche PDF recommandée :
- Génération d’un HTML structuré
- Styles CSS spécifiques A4
- Conversion HTML → PDF via Google Drive

Avantages :
- Excellente qualité d’impression
- Contrôle précis de la mise en page
- Solution gratuite
- Robuste pour documents volumineux

Images :
- Récupération des blobs Drive
- Insertion via balises img
- Dimensionnement par CSS

Temps d’exécution :
- Génération asynchrone recommandée
- Suivi via job (PENDING, RUNNING, DONE, ERROR)
- Journalisation systématique

---

## 13. Hors périmètre explicite

- Partage externe du PDF
- Publication publique
- Édition collaborative
- Fonctionnalités sociales

---

## 14. Principes directeurs

- Priorité à la qualité d’impression
- Robustesse et simplicité
- Gratuité totale
- Intégration directe dans l’architecture existante
- Versioning et traçabilité systématiques

---

Ce document constitue la spécification technique de référence pour la génération du PDF A4 imprimable (SPEC-004).
