# Spécification UI / UX – PWA familiale mobile

## 1. Objectif

Définir l’interface utilisateur et l’expérience UX d’une Progressive Web App (PWA) familiale, mobile-first, permettant :
- la création rapide d’articles photo,
- la consultation chronologique et filtrée,
- l’accès à des statistiques simples,
dans le but d’une agrégation annuelle en PDF.

L’interface doit être extrêmement simple, intuitive, rapide et sans surcharge fonctionnelle.

---

## 2. Contraintes d’usage

- Usage mobile exclusivement
- Orientation portrait uniquement
- Pas de gestion hors ligne
- Utilisation familiale, multi-utilisateurs
- Aucun aspect social
- Aucune interaction complexe ou cachée

---

## 3. Principes UX fondamentaux

- Une action principale par écran
- Priorité absolue à la photo
- Temps cognitif minimal
- Aucun jargon technique
- Aucun écran inutile
- Retour visuel immédiat après chaque action
- Toute l'interface en anglais

---

## 4. Écrans principaux

### 4.1 Écran d’accueil / Timeline

#### Objectif
Consulter rapidement les articles existants et accéder à la création.

#### Contenu d’un article
- Image principale (pleine largeur)
- Texte (si présent)
- Auteur
- Date (date de modification)

#### Ordre
- Du plus récent au plus ancien

#### Actions disponibles
- Bouton flottant : création d’un nouvel article
- Icône filtre (accès rapide)

#### Wireframe textuel

---------------------------------
☰        Année 2026         🔍
---------------------------------
[ Image article ]
Texte éventuel…
— Alice · 12 mars
---------------------------------
[ Image article ]
— Bob · 10 mars
---------------------------------
                ➕
---------------------------------

#### Règles UX
- Tap sur un article = ouverture en modification
- Scroll fluide (infinite scroll)
- Aucun bouton secondaire par article

---

### 4.2 Création / Modification d’un article

#### Objectif
Créer ou modifier un article en une seule étape.

#### Sélection photo
- Galerie
- Appareil photo

Après sélection :
- Aperçu immédiat plein écran

#### Options
- Photo simple (par défaut)
- Action dédiée : assemblage de plusieurs photos

#### Champ texte
- Optionnel
- Limité à 300 caractères
- Champ multi-ligne
- Placeholder discret

#### Actions
- Bouton principal unique : Valider
- Action secondaire discrète : Annuler

#### Wireframe textuel

---------------------------------
←       Article
---------------------------------
[ Aperçu image ]
[ Assembler plusieurs photos ]
Texte (optionnel)
[.........................]
        ✔ Valider
---------------------------------

#### Brouillons
- Sauvegarde automatique locale
- Reprise possible
- Indication visuelle discrète

#### Règles UX
- Aucun écran intermédiaire
- Validation explicite
- Retour immédiat à la timeline

---

### 4.3 Filtres & navigation temporelle

#### Objectif
Explorer les articles par période sans rupture de navigation.

#### Filtres disponibles
- Par mois
- Par année
- Par plage de dates personnalisée

#### Interaction
- Écran simple ou panneau plein
- Sélection directe
- Application immédiate

#### Wireframe textuel

-------------------------
Filtres
-------------------------
Année : 2026
Mois  : Mars
Du    : 01/03/2026
Au    : 31/03/2026
      Appliquer
-------------------------

#### Règles UX
- Aucun rechargement complet
- Filtre visible une fois appliqué
- Réinitialisation simple

---

### 4.4 Écran Statistiques

#### Objectif
Donner une vision synthétique de l’activité.

#### Données affichées
- Nombre d’articles par mois
- Nombre d’articles par année

#### Présentation
- Liste ou histogrammes simples
- Lisibilité prioritaire
- Aucun paramétrage

#### Wireframe textuel

-------------------------
Statistiques
-------------------------
2026
Janvier  : 12
Février : 9
Mars    : 15
Total   : 36 articles
-------------------------

---

## 5. Parcours utilisateur clés

### 5.1 Création rapide d’un article
1. Ouverture de l’application
2. Création d’un article
3. Sélection ou prise de photo
4. Ajout éventuel de texte
5. Validation
6. Retour immédiat à la timeline

### 5.2 Modification d’un article
1. Sélection d’un article existant
2. Modification image et/ou texte
3. Validation
4. Mise à jour visible immédiatement

### 5.3 Consultation d’une année complète
1. Ouverture des filtres
2. Sélection de l’année
3. Consultation fluide de la timeline filtrée

### 5.4 Accès aux statistiques
1. Accès à l’écran statistiques
2. Lecture directe des compteurs
3. Retour simple à la timeline

---

## 6. Comportements UX attendus

- Feedback visuel immédiat
- Gestion élégante :
  - article sans texte
  - texte très court
  - images portrait ou paysage
- Aucun popup inutile
- Messages sobres et explicites

---

## 7. Principes visuels

- Design épuré
- Priorité à la photo
- Typographie large et lisible
- Palette de couleurs limitée
- Icônes simples et explicites
- Aucun élément décoratif inutile

---

## 8. Hors périmètre explicite

- Notifications
- Commentaires
- Likes / réactions
- Partage
- Fonctionnalités sociales
- Personnalisation avancée

---

## 9. Principes directeurs UI / UX

- Simplicité avant sophistication
- Rapidité avant exhaustivité
- Cohérence sur tous les écrans
- Interface familiale, durable et intemporelle

---

Ce document constitue la spécification UI / UX de référence (SPEC-002).
