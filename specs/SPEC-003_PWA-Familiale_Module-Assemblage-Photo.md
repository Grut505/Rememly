# Spécification technique — Module d’assemblage photo (PWA)

## 1. Contexte

L’application est une Progressive Web App (PWA) mobile-first, utilisée exclusivement sur smartphone en orientation portrait.

Architecture existante :
- Frontend : PWA
- Backend : Google Apps Script
- Stockage :
  - Google Drive pour les images originales, les images d’assemblage et les PDFs
  - Google Sheets pour les métadonnées

Chaque article possède une image finale unique stockée sur Google Drive.  
Cette image peut être :
- une photo simple,
- ou une image issue de l’assemblage de plusieurs photos.

Le module d’assemblage photo est intégré au frontend et fonctionne exclusivement côté client.

---

## 2. Objectif du module

Permettre à un utilisateur de créer une image unique à partir de plusieurs photos afin de produire l’image principale d’un article.

Le module doit être :
- simple à utiliser,
- robuste sur mobile,
- adapté à un usage familial,
- précis sur le rendu final,
- sans dépendance serveur pour le traitement des images.

---

## 3. Contraintes générales

- Usage mobile uniquement
- Orientation portrait uniquement
- Interactions tactiles
- Aucun traitement serveur d’image
- Performance compatible avec des appareils mobiles standards
- Intégration sans remise en cause de l’architecture globale

---

## 4. Sélection des photos

### 4.1 Nombre et sources

- Sélection de 1 à 10 photos
- Sources possibles :
  - galerie du téléphone
  - appareil photo (prise directe)

### 4.2 Gestion dynamique

- Ajout de photos à tout moment
- Suppression de photos à tout moment
- Réorganisation des photos par glisser-déposer

La suppression ou l’ajout d’une photo ne réinitialise pas l’état global de l’assemblage.

---

## 5. Templates d’assemblage

### 5.1 Principe

Le module repose sur des templates prédéfinis afin de garantir :
- une simplicité d’usage,
- un rendu cohérent,
- une maîtrise des ratios pour l’impression.

Chaque template définit :
- le nombre de zones,
- leur disposition,
- leur ratio.

### 5.2 Templates disponibles

- 2×1 vertical  
  Deux zones empilées verticalement

- 2×1 horizontal  
  Deux zones côte à côte

- 4×4  
  Grille régulière de 4 zones

- 3 + 2  
  Trois zones principales + deux secondaires

- 3 + 2 + 2  
  Une zone principale + deux rangées secondaires

Les templates sont présentés sous forme de vignettes visuelles sélectionnables.

---

## 6. Manipulation des images

### 6.1 Ajustements par zone

Chaque zone dispose de réglages indépendants :
- zoom (scale)
- déplacement (x / y)
- recadrage non destructif

Les manipulations sont réalisées par gestes tactiles :
- pincement pour zoom
- glisser pour déplacement

### 6.2 Comportements clés

- Les réglages d’une zone n’impactent jamais les autres
- Le remplacement d’une photo conserve :
  - le cadrage,
  - le zoom,
  - la position des autres zones
- Une photo peut être remplacée sans réinitialiser le template

---

## 7. Architecture frontend du module

### 7.1 Composants principaux

- PhotoPicker  
  Sélection et gestion des photos sources

- TemplateSelector  
  Sélection du template d’assemblage

- AssemblyCanvas  
  Canvas HTML5 principal contenant l’assemblage

- ZoneController  
  Gestion individuelle des zones (zoom, déplacement)

- Toolbar  
  Actions principales (annuler, réinitialiser zone, valider)

- StateManager  
  Gestion centralisée de l’état de l’assemblage

---

## 8. Traitement technique des images

### 8.1 Choix techniques

- Utilisation du Canvas HTML5
- Manipulation via `drawImage`
- Gestion des transformations par matrices (scale / translate)
- Aucune librairie lourde obligatoire

### 8.2 Résolution cible

- Résolution finale minimale :
  - largeur équivalente A4 à 300 DPI (~2480 px)
- Ratio contrôlé par le template
- Compression appliquée uniquement à l’export final

### 8.3 Performances

- Chargement progressif des images
- Redimensionnement préalable des images sources
- Limitation stricte du nombre de photos (max 10)

---

## 9. Sauvegarde de l’état et reprise

### 9.1 Données sauvegardées

L’état complet de l’assemblage est sérialisé sous forme JSON.

Contenu :
- identifiants des photos sources
- template sélectionné
- pour chaque zone :
  - photo associée
  - zoom
  - position x / y
  - dimensions de recadrage

### 9.2 Stockage

- Sauvegarde locale automatique (IndexedDB)
- Enregistrement possible dans Google Sheets ou en métadonnée associée à l’article

### 9.3 Reprise

- Un assemblage existant peut être rouvert
- L’état est restauré fidèlement
- Les ajustements précédents sont conservés

---

## 10. Export final

### 10.1 Génération de l’image

- Rendu final sur un canvas hors écran
- Fusion de toutes les zones
- Génération d’une image unique

### 10.2 Format

- Format : JPEG (par défaut) ou PNG
- Qualité ajustée pour impression A4
- Métadonnées EXIF non nécessaires

### 10.3 Stockage

- Upload de l’image finale vers Google Drive
- Stockage dans le dossier `/assembled/` de l’année
- L’URL ou le fileId est associé à l’article dans Google Sheets

Les photos sources peuvent être conservées séparément dans `/originals/`.

---

## 11. Contraintes UX spécifiques

- Interactions tactiles fluides
- Aucun encombrement visuel
- Actions clairement identifiées
- Annulation possible à chaque étape
- Aucun effet décoratif ou animation complexe

---

## 12. Hors périmètre explicite

- Filtres photo
- Effets artistiques
- Animations complexes
- Partage
- Traitement serveur d’images

---

## 13. Principes directeurs du module

- Prévisibilité du rendu
- Simplicité avant exhaustivité
- Robustesse sur mobile
- Réversibilité des actions
- Intégration transparente dans la PWA existante

---

Ce document constitue la spécification technique de référence du module d’assemblage photo (SPEC-003).
