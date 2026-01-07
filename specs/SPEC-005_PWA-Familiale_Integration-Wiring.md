# SPEC-005 — Intégration finale & wiring (PWA + Google Apps Script)

## 1. Portée et invariants

Cette spécification décrit l’intégration complète entre la PWA et Google Apps Script, en s’appuyant strictement sur les modules déjà définis :

- SPEC-001 : Architecture & stockage
- SPEC-002 : UI / UX PWA mobile
- SPEC-003 : Module d’assemblage photo
- SPEC-004 : Génération du PDF A4 imprimable

Ces éléments constituent la source de vérité et ne doivent pas être remis en cause.

Contraintes invariantes :
- Usage mobile uniquement
- Orientation portrait uniquement
- Backend unique : Google Apps Script (Web App)
- Authentification : Google Sign-In + liste blanche
- Stockage : Google Sheets (métadonnées) + Google Drive (images, PDFs)
- Aucun lien public, aucun partage externe

Objectif : décrire un wiring clair, simple et robuste permettant une application fonctionnelle de bout en bout.

---

## 2. Vue d’ensemble du wiring global

### 2.1 Architecture logique (schéma textuel)

[PWA]
- Authentification Google (ID token)
- Timeline / filtres / statistiques
- Éditeur d’article
- Module d’assemblage photo (local)
- Export image finale (local)
- Appels API JSON vers Apps Script

↓

[Google Apps Script – Web App]
- Vérification ID token
- Vérification compte autorisé
- Accès Google Sheets (articles, jobs PDF)
- Accès Google Drive (images, PDFs)
- Génération PDF asynchrone

↓

[Stockage]
- Google Sheets :
  - articles
  - jobs_pdf
- Google Drive :
  - /YYYY/originals
  - /YYYY/assembled
  - /YYYY/pdf

---

## 3. Principes d’échange frontend ↔ backend

- Tous les échanges se font via HTTPS
- Format unique : JSON
- Authentification obligatoire via header Authorization
- Aucune lecture ou écriture directe Drive / Sheets depuis le frontend
- Toute logique métier est côté Apps Script

Format de réponse standard :

Succès :
{
  ok: true,
  data: ...
}

Erreur :
{
  ok: false,
  error: {
    code: string,
    message: string
  }
}

Codes d’erreur recommandés :
- AUTH_REQUIRED
- FORBIDDEN
- VALIDATION_ERROR
- NOT_FOUND
- UPLOAD_FAILED
- PDF_JOB_FAILED
- INTERNAL_ERROR

---

## 4. Endpoints Apps Script exposés

### 4.1 Authentification

POST /api/auth/check

- Vérifie le token Google
- Vérifie l’email dans la whitelist

Réponse :
{
  ok: true,
  data: {
    user: { email, name },
    timezone: "Europe/Paris"
  }
}

---

### 4.2 Articles

GET /api/articles/list

Paramètres (query) :
- year (optionnel)
- month (optionnel)
- from (optionnel, ISO Europe/Paris)
- to (optionnel, ISO Europe/Paris)
- limit (défaut 40)
- cursor (pagination)

Réponse :
{
  ok: true,
  data: {
    items: Article[],
    next_cursor: string|null
  }
}

GET /api/articles/get?id=ARTICLE_ID

POST /api/articles/create

Payload :
{
  auteur,
  texte,
  image: { fileName, mimeType, base64 },
  assembly_state: object|null,
  full_page: boolean
}

Traitement :
- upload image finale sur Drive
- écriture ligne Sheets
- date_creation = now
- date_modification = now

POST /api/articles/update

Payload :
{
  id,
  texte?,
  image?,
  assembly_state?,
  full_page?
}

Traitement :
- nouvel upload image si fournie
- écrasement logique
- mise à jour date_modification

---

### 4.3 PDF annuel

POST /api/pdf/create

Payload :
{
  from,
  to
}

Traitement :
- création job PDF (PENDING)
- lancement génération asynchrone

Réponse :
{
  ok: true,
  data: { job_id }
}

GET /api/pdf/status?job_id=...

Réponse :
{
  ok: true,
  data: {
    status,
    progress,
    pdf_file_id?,
    pdf_url?,
    error_message?
  }
}

---

## 5. Modèles de données échangés

### 5.1 Article

Article {
  id: string
  date_creation: string
  date_modification: string
  auteur: string
  texte: string
  image_url: string
  image_file_id: string
  year: number
  assembly_state?: object
  full_page?: boolean
}

Le tri et l’affichage frontend reposent exclusivement sur date_modification.

---

### 5.2 Job PDF

PdfJob {
  job_id: string
  status: PENDING | RUNNING | DONE | ERROR
  progress: number
  pdf_file_id?: string
  pdf_url?: string
  error_message?: string
}

---

## 6. Parcours applicatifs complets

### 6.1 Création d’un article

1. Timeline → action “Créer”
2. Sélection ou prise de photo
3. Optionnel : module d’assemblage photo
4. Export local image finale + assembly_state
5. Saisie texte optionnelle
6. Validation
7. Appel POST /api/articles/create
8. Upload Drive + écriture Sheets
9. Retour immédiat timeline avec nouvel article

---

### 6.2 Modification d’un article

1. Tap sur un article existant
2. Chargement données via /api/articles/get
3. Modification image et/ou texte
4. Validation
5. Appel POST /api/articles/update
6. Mise à jour Drive + Sheets
7. Rafraîchissement visuel immédiat

---

### 6.3 Consultation & filtres

1. Chargement initial via /api/articles/list
2. Application filtres (mois, année, plage)
3. Nouvel appel list avec paramètres
4. Mise à jour UI sans rechargement complet

---

### 6.4 Génération du PDF annuel

1. Ouverture formulaire PDF (dates par défaut)
2. Validation
3. Appel POST /api/pdf/create
4. Affichage état “en cours”
5. Polling /api/pdf/status
6. Confirmation succès + lien Drive

---

## 7. Sécurité & contrôle d’accès

Côté Apps Script, pour chaque requête :
- validation ID token Google
- vérification email autorisé
- refus immédiat sinon

Règles strictes :
- aucun endpoint public
- aucun accès Drive direct
- aucun lien “anyone with link”
- permissions héritées des dossiers privés

---

## 8. Organisation du code

### 8.1 Frontend (exemple)

- /src
  - auth/
  - api/
  - screens/
    - timeline
    - editor
    - filters
    - stats
  - modules/
    - photo-assembly
  - services/
    - articles
    - pdf
  - state/
  - ui/

### 8.2 Apps Script

- main.gs (routing HTTP)
- auth.gs
- articles.gs
- drive.gs
- pdf.gs
- jobs.gs
- utils.gs

Responsabilités séparées, fichiers courts, noms explicites.

---

## 9. Gestion des cas limites

- Échec upload image :
  - message clair
  - possibilité de réessayer
- Génération PDF longue :
  - job asynchrone
  - feedback utilisateur
- Article sans texte :
  - accepté
- Article sans assemblage :
  - image simple acceptée
- Volume élevé :
  - pagination systématique
  - génération PDF asynchrone

Aucune erreur ne doit bloquer définitivement l’application.

---

## 10. Principes directeurs

- Simplicité avant sophistication
- Frontend léger, backend centralisé
- Données cohérentes et traçables
- Sécurité stricte par défaut
- Implémentation progressive possible

---

Ce document constitue la spécification d’intégration et de wiring de référence (SPEC-005).  
Il permet de passer immédiatement à l’implémentation complète de l’application.
