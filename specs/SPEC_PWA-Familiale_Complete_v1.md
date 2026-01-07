# Spécification complète — PWA familiale (Google Workspace)

Ce document constitue la **spécification unique et consolidée** de l’application PWA familiale.
Il regroupe l’intégralité des SPEC-001 à SPEC-006.
Aucune section ne doit être interprétée indépendamment des autres.

---

# SPEC-001 — Architecture & stockage

## Objectif
Concevoir une Progressive Web App (PWA) familiale, mobile-first, permettant de créer des articles photo et de générer un PDF annuel imprimable, en utilisant exclusivement Google Workspace.

## Contraintes
- PWA mobile-first
- Orientation portrait uniquement
- Backend : Google Apps Script
- Authentification : Google Sign-In, comptes autorisés uniquement
- Stockage : Google Sheets + Google Drive
- Aucun service externe ou payant

## Architecture globale

PWA → Apps Script Web App → Google Sheets + Google Drive

Frontend :
- UI
- Sélection photo
- Assemblage photo
- Prévisualisation

Backend (Apps Script) :
- Vérification authentification
- CRUD articles
- Upload Drive
- Génération PDF

## Organisation Google Drive

/Appli/  
  /YYYY/  
    /originals/  
    /assembled/  
    /pdf/  

## Google Sheets (articles)

Colonnes obligatoires :
- id
- date_creation (Europe/Paris)
- date_modification (Europe/Paris)
- auteur
- texte (0–300)
- image_url

Tri et affichage basés sur date_modification.

---

# SPEC-002 — UI / UX PWA mobile

## Principes
- Simplicité extrême
- Priorité à la photo
- Une action principale par écran
- Aucun élément social

## Écrans
- Timeline chronologique
- Création / modification article
- Filtres temporels
- Statistiques simples

## Règles UX
- Retour visuel immédiat
- Pas de popup inutile
- Gestion élégante des cas vides
- Navigation fluide sans rechargement

---

# SPEC-003 — Module d’assemblage photo

## Objectif
Créer une image unique à partir de 1 à 10 photos, côté client.

## Fonctionnalités
- Templates prédéfinis
- Zoom / déplacement / recadrage non destructif
- Réorganisation et remplacement des photos
- Sauvegarde de l’état d’assemblage

## Export
- Image finale unique
- Résolution compatible A4
- Upload vers Drive

---

# SPEC-004 — Génération PDF A4

## Objectif
Générer un PDF annuel imprimable structuré par mois.

## Structure
1. Page de garde
2. Intercalaires mensuels
3. Pages de contenu (2 articles/page ou pleine page)

## Règles
- Encadré obligatoire
- Texte centré (~16pt)
- Images adaptées format iPhone
- Pagination continue incluant couverture et intercalaires

## Implémentation
- Lecture Sheets
- Groupement par mois (FR)
- Génération HTML → PDF via Drive
- Versioning systématique

---

# SPEC-005 — Intégration & wiring

## Endpoints principaux
- /api/auth/check
- /api/articles/list
- /api/articles/create
- /api/articles/update
- /api/pdf/create
- /api/pdf/status

## Parcours clés
- Création article → upload image → écriture Sheets
- Modification → écrasement logique → date_modification mise à jour
- Génération PDF → job asynchrone → polling

## Sécurité
- Vérification ID token systématique
- Liste blanche côté Apps Script
- Aucun accès direct Drive / Sheets depuis le frontend

---

# SPEC-006 — Nettoyage, cas limites & durabilité

## Cas limites fonctionnels

### Article sans texte
- Accepté
- Mise en page centrée sur l’image
- Métadonnées toujours affichées

### Texte très court
- Aucun ajustement automatique
- Pas de remplissage artificiel

### Image très panoramique
- Respect du ratio
- Marges renforcées
- Aucun rognage automatique

### Image très verticale
- Centrage strict
- Adaptation au demi A4 ou pleine page

### Assemblage incomplet
- Blocage à la validation
- Message explicite : “Assemblage incomplet”

### Modification après génération PDF
- Autorisée
- Aucun impact rétroactif sur PDFs existants
- Nouveau PDF = nouvelle version

### Mois sans article
- Intercalaire généré
- Zéro page de contenu

### Génération PDF sans article
- PDF valide avec couverture + intercalaires
- Message utilisateur clair

---

## Limites Google Apps Script

### Temps d’exécution
- Génération PDF asynchrone obligatoire
- Découpage logique par étapes

### Volumes
- Sheets : OK (<500 lignes/an)
- Drive : acceptable sur plusieurs années

### Appels concurrents
- Un job PDF actif par utilisateur recommandé
- Refus clair si déjà en cours

---

## Nettoyage & maintenance

### Nommage Drive
- Images : YYYYMMDD_HHMMSS_<articleId>_assembled.jpg
- PDF : Livre_YYYY_plage_gen-HHMMSS_vNN.pdf

### Règles
- Aucun renommage manuel
- Aucune suppression automatique
- Nettoyage manuel acceptable une fois/an

---

## Robustesse UX

- Sauvegarde locale des brouillons
- États “en cours” explicites
- Erreurs non bloquantes
- Possibilité de réessayer sans perte

---

## Dette technique acceptable

### Acceptable
- HTML de génération PDF monolithique
- Absence de cache avancé
- Pas de prévisualisation PDF

### Non acceptable
- Perte de données
- Accès Drive non contrôlé
- Blocage UI sans retour utilisateur
- Dépendance externe

---

## Principes finaux

- Application calme, prévisible et durable
- Simplicité avant sophistication
- Robustesse avant optimisation
- Adaptée à un usage familial sur plusieurs années

---

Ce document constitue la **spécification complète, unique et de référence** de l’application PWA familiale.
Toute implémentation doit s’y conformer strictement.
