# SPEC-006 — Nettoyage, cas limites & durabilité

## 1. Portée et contexte figé

Cette spécification traite exclusivement :
- de la stabilisation,
- de la gestion des cas limites,
- de la durabilité technique et UX,

pour l’application PWA familiale existante.

Le contexte suivant est figé et ne doit pas être remis en cause :
- PWA mobile-first, orientation portrait uniquement
- Backend : Google Apps Script
- Authentification Google restreinte (liste blanche)
- Stockage : Google Drive + Google Sheets
- Génération annuelle d’un PDF A4 imprimable
- Volumétrie : 150 à 400 articles par an
- Modules existants :
  - architecture & stockage
  - UI / UX
  - assemblage photo
  - génération PDF
  - wiring frontend / backend

Aucune nouvelle fonctionnalité n’est introduite.

---

## 2. Cas limites fonctionnels et comportements attendus

### 2.1 Article sans texte

Situation :
- Le champ texte est vide.

Comportement attendu :
- L’article est valide.
- La mise en page privilégie l’image.
- L’encadré est conservé.
- Les métadonnées (auteur, date) sont affichées normalement.
- Aucun message d’erreur ou avertissement.

---

### 2.2 Article avec texte très court

Situation :
- Texte de quelques caractères seulement.

Comportement attendu :
- Aucun ajustement automatique.
- Le texte reste centré.
- Aucun remplissage artificiel.
- Le rendu peut être visuellement plus aéré, sans correction.

---

### 2.3 Image très panoramique

Situation :
- Ratio très horizontal.

Comportement attendu :
- Respect strict du ratio d’origine.
- Aucun rognage automatique.
- Marges supérieures et inférieures renforcées.
- Image centrée dans son encadré.
- Aucun redimensionnement destructif.

---

### 2.4 Image très verticale

Situation :
- Ratio très vertical.

Comportement attendu :
- Image centrée verticalement et horizontalement.
- Adaptation stricte à l’espace disponible (demi A4 ou pleine page).
- Respect des marges d’impression.
- Aucun rognage automatique.

---

### 2.5 Assemblage photo incomplet

Situation :
- Template sélectionné mais zones non remplies.

Comportement attendu :
- Validation bloquée.
- Message clair et non bloquant :
  “Certaines zones de l’assemblage sont vides.”
- Aucune perte de l’état courant.
- Possibilité de corriger ou d’annuler.

---

### 2.6 Modification d’un article déjà utilisé dans un PDF généré

Situation :
- Un article est modifié après génération d’un ou plusieurs PDFs.

Comportement attendu :
- Modification autorisée.
- Aucun impact rétroactif sur les PDFs existants.
- Toute nouvelle génération PDF produit une nouvelle version.
- Aucun avertissement bloquant pour l’utilisateur.

---

### 2.7 Mois sans article

Situation :
- Un mois ne contient aucun article.

Comportement attendu :
- L’intercalaire mensuel est généré.
- Aucune page de contenu ne suit.
- Pagination conservée.
- Aucun message spécifique requis.

---

### 2.8 Génération PDF sur une plage sans article

Situation :
- La plage de dates ne contient aucun article.

Comportement attendu :
- Génération d’un PDF valide.
- Contenu :
  - page de garde
  - intercalaires mensuels
  - aucune page d’article
- Message utilisateur clair :
  “Aucun article sur la période sélectionnée.”

---

## 3. Limites Google Apps Script et stratégies

### 3.1 Temps d’exécution

Risque :
- Dépassement du temps maximal lors de la génération PDF.

Stratégies :
- Génération PDF asynchrone obligatoire.
- Découpage logique interne (préparation données / rendu / export).
- Suivi par job avec statut (PENDING, RUNNING, DONE, ERROR).

Message utilisateur :
- “Génération en cours, cela peut prendre quelques minutes.”

---

### 3.2 Volumes Drive et Sheets

Risque :
- Accumulation de fichiers sur plusieurs années.

Analyse :
- Sheets : volumétrie faible (<500 lignes/an).
- Drive : volume acceptable sur plusieurs années.

Stratégies :
- Aucun archivage automatique.
- Organisation stricte par année.
- Nettoyage manuel assumé (voir section 4).

---

### 3.3 Génération PDF longue

Risque :
- Interface bloquée ou perçue comme figée.

Stratégies :
- Retour immédiat après lancement.
- Indicateur d’état clair.
- Polling léger côté frontend.
- Possibilité de quitter l’écran sans interrompre le job.

---

### 3.4 Appels concurrents

Risque :
- Lancement simultané de plusieurs générations PDF.

Stratégies :
- Limiter à un job PDF actif par utilisateur.
- Refus clair si un job est déjà en cours.

Message utilisateur :
- “Une génération est déjà en cours pour ce compte.”

---

## 4. Nettoyage & maintenance

### 4.1 Conventions de nommage Drive

Images assemblées :
YYYYMMDD_HHMMSS_<articleId>_assembled.jpg

Images originales :
YYYYMMDD_HHMMSS_<articleId>_<index>.jpg

PDF :
Livre_YYYY_YYYYMMDD-YYYYMMDD_gen-YYYYMMDD_HHMMSS_vNN.pdf

---

### 4.2 Règles de rangement

- Un dossier racine par application.
- Un dossier par année.
- Sous-dossiers fixes :
  - originals
  - assembled
  - pdf
- Aucun déplacement automatique entre années.

---

### 4.3 Bonnes pratiques anti-corruption

- Ne jamais modifier manuellement les fichiers Drive.
- Ne jamais modifier manuellement les IDs dans Sheets.
- Toujours passer par l’application pour créer ou modifier.
- Préférer l’ajout de nouvelles lignes/fichiers à l’écrasement.

---

### 4.4 Stratégie de nettoyage acceptable

- Nettoyage manuel autorisé, occasionnel (ex : annuel).
- Suppression possible :
  - images orphelines clairement identifiées,
  - PDFs obsolètes si souhaité (non automatique).
- Aucune logique de nettoyage automatique implémentée.

---

## 5. Robustesse UX

### 5.1 Prévention des pertes de données

- Sauvegarde locale automatique des brouillons.
- Restauration possible après interruption.
- Aucune action destructive sans confirmation explicite.

---

### 5.2 États d’attente clairs

- Indicateurs visuels pour :
  - upload image,
  - génération PDF,
  - chargement liste articles.
- Messages courts, factuels, non anxiogènes.

---

### 5.3 Gestion des erreurs

Principes :
- Aucune erreur ne bloque définitivement l’application.
- Toujours proposer une action possible (réessayer, annuler).

Exemples :
- Échec upload :
  “L’image n’a pas pu être envoyée. Réessayer.”
- Erreur PDF :
  “La génération a échoué. Vous pouvez relancer.”

---

## 6. Dette technique acceptable

### 6.1 Acceptable dès le départ

- HTML de génération PDF monolithique.
- CSS simple et peu factorisé.
- Absence de prévisualisation PDF.
- Nettoyage manuel assumé.

---

### 6.2 Non acceptable

- Perte silencieuse de données.
- Accès Drive non contrôlé.
- Blocage UI sans feedback.
- Dépendance à des services externes.
- Modification rétroactive des PDFs existants.

---

## 7. Checklist de robustesse

- [ ] Tous les cas limites listés sont gérés explicitement
- [ ] Aucune action destructrice sans confirmation
- [ ] Génération PDF toujours asynchrone
- [ ] Messages utilisateur clairs et non bloquants
- [ ] Organisation Drive strictement respectée
- [ ] Aucun accès Drive / Sheets hors Apps Script
- [ ] Nettoyage manuel possible sans risque
- [ ] Application utilisable sur plusieurs années sans maintenance lourde

---

## 8. Principes finaux

- Application calme et prévisible
- Simplicité avant sophistication
- Robustesse avant optimisation
- Durabilité adaptée à un usage familial long terme

---

Ce document constitue la spécification de stabilisation, de nettoyage et de durabilité de référence (SPEC-006).
Toute implémentation doit respecter strictement ces règles sans introduire de nouvelles fonctionnalités.
