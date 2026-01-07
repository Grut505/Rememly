# Spécification d’architecture – PWA familiale (Google Workspace uniquement)

## 1. Objectif

Concevoir une Progressive Web App (PWA) familiale, mobile-first, destinée à un usage smartphone, permettant :
- la création d’articles photo (photo simple ou assemblée),
- la consultation chronologique des articles,
- la génération d’un PDF annuel imprimable (A4).

L’architecture doit être simple, fiable, gratuite et exclusivement basée sur Google Workspace.

---

## 2. Contraintes générales

- Progressive Web App
- Mobile-first
- Orientation portrait uniquement
- Aucun service payant
- Aucun service externe à Google Workspace
- Pas de backend dédié hors Google Apps Script
- Pas de partage public ou externe

Hors périmètre explicite :
- notifications
- commentaires
- likes / réactions
- partage externe
- vidéos
- autres formats que PDF A4

---

## 3. Vue d’ensemble de l’architecture

[PWA (Smartphone)]  
- UI / édition / assemblage images  
- Google Sign-In (ID token)  
- Appels HTTPS vers Google Apps Script  
- Cache local (Service Worker)  

⬇  

[Google Apps Script – Web App]  
- Vérification du token Google  
- Liste blanche des comptes autorisés  
- Accès Google Drive  
- Accès Google Sheets  
- Génération PDF A4  

⬇  

- Google Sheets (métadonnées articles)  
- Google Drive (images et PDFs)

---

## 4. Frontend – Progressive Web App

### 4.1 Responsabilités

Le frontend prend en charge :
- l’interface utilisateur (UI),
- l’authentification utilisateur (Google Sign-In),
- la sélection et capture de photos,
- l’assemblage d’images côté client,
- la prévisualisation des articles,
- la consultation chronologique,
- le déclenchement de la génération PDF.

### 4.2 Contraintes UX

- Mobile-first strict
- Orientation portrait forcée
- Interfaces simples, peu chargées, gestes courts

### 4.3 Fonctionnalités techniques

- `manifest.json` (mode standalone)
- `service-worker.js`
  - cache des assets statiques
  - support offline limité (lecture cache + brouillons locaux)

### 4.4 Gestion des images

- Sélection via `<input type="file" accept="image/*">`
- Compression systématique côté client
- Correction de l’orientation (EXIF)
- Assemblage via Canvas (1 à 20 photos)
- Export d’une image finale (JPEG recommandé)

### 4.5 Stockage local

- Brouillons stockés localement (IndexedDB)
- Aucun stockage définitif côté client

---

## 5. Backend – Google Apps Script

### 5.1 Rôle général

Google Apps Script constitue l’unique backend :
- Web App exposant des endpoints HTTP
- Gestion de l’authentification
- Accès Google Drive et Google Sheets
- Génération de PDFs A4

### 5.2 Authentification et autorisation

- Authentification via Google Identity Services
- Transmission d’un ID token dans chaque appel API
- Vérification du token côté serveur
- Autorisation basée sur une liste blanche d’emails

Aucun accès n’est possible sans :
- token valide
- email explicitement autorisé

### 5.3 Accès aux données

- Lecture et écriture Google Sheets
- Lecture et écriture Google Drive
- Aucune exposition publique des fichiers

---

## 6. Organisation Google Drive

### 6.1 Arborescence

/FamilyPWA/  
&nbsp;&nbsp;/YYYY/  
&nbsp;&nbsp;&nbsp;&nbsp;/originals/  
&nbsp;&nbsp;&nbsp;&nbsp;/assembled/  
&nbsp;&nbsp;&nbsp;&nbsp;/pdfs/  

### 6.2 Règles

- Un dossier racine unique pour l’application
- Un sous-dossier par année
- Permissions privées héritées
- Aucun lien public ou partage externe

### 6.3 Convention de nommage

Images assemblées :  
`YYYYMMDD_HHMMSS_<articleId>_assembled.jpg`

PDFs :  
`YEAR_YYYYMMDD_HHMMSS_from-YYYYMMDD_to-YYYYMMDD_vNN.pdf`

---

## 7. Google Sheets – Modèle de données

### 7.1 Feuille principale : articles

1 ligne = 1 article

Colonnes obligatoires :
- `id` (unique)
- `date_creation` (date + heure, Europe/Paris)
- `date_modification` (date + heure, Europe/Paris)
- `auteur`
- `texte` (0 à 300 caractères)
- `image_url` (URL Drive de l’image finale)

Règle clé :
- le tri et l’affichage utilisent exclusivement `date_modification`

### 7.2 Colonnes techniques recommandées

- `year`
- `image_file_id`
- `status` (ACTIVE / DELETED)

### 7.3 Feuille technique optionnelle : jobs_pdf

Utilisée pour les générations PDF longues.

Colonnes :
- `job_id`
- `created_at`
- `created_by`
- `year`
- `date_from`
- `date_to`
- `status` (PENDING, RUNNING, DONE, ERROR)
- `progress`
- `pdf_file_id`
- `error_message`

---

## 8. Flux applicatifs

### 8.1 Authentification utilisateur

1. Connexion via Google Sign-In
2. Récupération d’un ID token côté frontend
3. Envoi du token à Google Apps Script
4. Vérification du token et de l’email
5. Autorisation ou refus d’accès

---

### 8.2 Création d’un article

Photo simple :
1. Sélection d’une photo
2. Compression et orientation côté client
3. Upload vers Apps Script
4. Écriture dans Drive et Sheets

Assemblage multi-photos :
1. Sélection de 1 à 20 photos
2. Assemblage Canvas côté client
3. Upload de l’image finale
4. Écriture dans Drive et Sheets

---

### 8.3 Modification d’un article

- Mise à jour du texte et/ou de l’image
- Génération d’une nouvelle image assemblée si nécessaire
- Mise à jour de la ligne Google Sheets
- Mise à jour de `date_modification`

L’écrasement est logique (nouvelle image + référence mise à jour).

---

### 8.4 Consultation chronologique

- Lecture paginée des articles
- Tri par `date_modification` décroissante
- Chargement progressif (infinite scroll)

---

### 8.5 Génération PDF annuel

1. Sélection d’une plage de dates
2. Création d’un job PDF
3. Traitement asynchrone par Apps Script
4. Génération HTML puis export PDF A4
5. Application d’un versioning automatique
6. Stockage dans le dossier `/pdfs/` de l’année
7. Mise à disposition du lien de consultation

---

## 9. Répartition des responsabilités

### Frontend (PWA)

- Interface utilisateur
- Authentification Google
- Sélection et assemblage des photos
- Prévisualisation
- Navigation chronologique
- Déclenchement de la génération PDF

### Google Apps Script

- Vérification de l’authentification
- Autorisation par liste blanche
- Accès Drive et Sheets
- CRUD des articles
- Génération et versioning des PDFs
- Gestion des traitements longs

---

## 10. Volumétrie et fiabilité

- 150 à 400 articles par an
- 1 à 20 photos par article
- Génération PDF pouvant durer plusieurs dizaines de secondes

Mesures :
- Assemblage et compression des images côté client
- Pagination côté frontend
- Génération PDF asynchrone recommandée

---

## 11. Principes directeurs

- Simplicité avant sophistication
- Aucun service externe
- Aucune dépendance payante
- Architecture modulaire et évolutive
- Base solide prête à être enrichie ultérieurement

---

Ce document constitue la première spécification fonctionnelle et technique de référence.
