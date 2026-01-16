# Rememly - Guide de Déploiement

## Architecture

```
Frontend (React/Vite)          Backend (Google Apps Script)
        |                               |
   localhost:3000                  Apps Script
   ou GitHub Pages                 via clasp
```

## Fichiers de Configuration

| Fichier | Usage |
|---------|-------|
| `frontend/.env` | Développement local |
| `frontend/.env.production` | Build production (GitHub Pages) |
| `backend/.clasp.json` | Configuration clasp |

## Déploiement Local (Test)

### 1. Déployer le Backend (si modifié)

```bash
# Depuis le dossier backend, utiliser npx clasp (installé localement)
cd /home/ygraufogel/claude/Rememly/backend

# Push des fichiers
npx clasp push

# Redéployer sur l'ID de déploiement existant
npx clasp deploy -i AKfycbzuwNbr8iLb1ADjUPvYHwaXJtJk0WnKPLxK0sbDZIyxeNwX1GmROSJe1pjKXoXCR8lo
```

### 2. Mettre à jour la version backend dans le frontend

Après un nouveau déploiement, mettre à jour `VITE_BACKEND_VERSION` dans :
- `frontend/.env` (pour le dev local)
- `frontend/.env.production` (pour la prod)

### 3. Lancer le serveur de développement

```bash
cd /home/ygraufogel/claude/Rememly/frontend
npm run dev
```

**IMPORTANT** : Le serveur DOIT tourner sur `http://localhost:3000/`

Si le port 3000 est occupé :
```bash
lsof -ti:3000 | xargs -r kill -9
npm run dev
```

### Checklist Déploiement Local

- [ ] Backend pushé via clasp (si modifié)
- [ ] Backend redéployé avec `clasp deploy -i <deployment_id>`
- [ ] `frontend/.env` pointe vers la bonne URL backend
- [ ] `VITE_BACKEND_VERSION` à jour dans `frontend/.env`
- [ ] Serveur dev lancé sur port 3000
- [ ] Version affichée correcte dans le menu (ex: `v1.2.0 / backend @40`)

---

## Déploiement Remote (GitHub Pages)

### 1. Déployer le Backend (si modifié)

Même procédure que pour le local.

### 2. Mettre à jour les fichiers de configuration

S'assurer que `frontend/.env.production` contient :
- La bonne `VITE_APPS_SCRIPT_URL`
- La bonne `VITE_BACKEND_VERSION`

### 3. Build et déploiement GitHub Pages

```bash
cd /home/ygraufogel/claude/Rememly/frontend
npm run build
npm run deploy
```

Note: `npm run deploy` utilise `gh-pages` pour publier le dossier `dist/` sur la branche `gh-pages`.

### 4. Commit et push des sources

```bash
cd /home/ygraufogel/claude/Rememly
git add .
git commit -m "Description des changements"
git push origin main
```

### Checklist Déploiement Remote

- [ ] Backend pushé et redéployé (si modifié)
- [ ] `frontend/.env.production` à jour
- [ ] `npm run build` réussi
- [ ] `npm run deploy` réussi
- [ ] Sources commitées et pushées sur main
- [ ] Vérifier sur https://ygraufogel.github.io/Rememly/

---

## URLs Importantes

| Service | URL |
|---------|-----|
| Dev local | http://localhost:3000/ |
| GitHub Pages | https://ygraufogel.github.io/Rememly/ |
| Apps Script Editor | https://script.google.com/home/projects/1234.../edit |
| Deployment ID actuel | `AKfycbzuwNbr8iLb1ADjUPvYHwaXJtJk0WnKPLxK0sbDZIyxeNwX1GmROSJe1pjKXoXCR8lo` |

---

## Troubleshooting

### Le serveur démarre sur le mauvais port
```bash
lsof -ti:3000 | xargs -r kill -9
```

### clasp ne fonctionne pas sous WSL
**Solution** : Utiliser `npx clasp` depuis le dossier backend (clasp est installé localement via npm).

```bash
cd /home/ygraufogel/claude/Rememly/backend
npx clasp push
npx clasp deploy -i <deployment_id>
```

**Note** : Ne PAS utiliser la commande `clasp` globale (pointe vers Windows et bloque). Toujours utiliser `npx clasp`.

### La version backend affichée est incorrecte
Vérifier et synchroniser `VITE_BACKEND_VERSION` dans `.env` et `.env.production`

### Erreur CORS avec le backend
Vérifier que `VITE_APPS_SCRIPT_URL` pointe vers le bon deployment ID
