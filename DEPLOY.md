# Guide de déploiement Rememly

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

## Configuration initiale du Web App (une seule fois)

Après chaque nouveau déploiement avec `clasp deploy`, il faut configurer les permissions :

1. Allez sur https://script.google.com
2. Ouvrez le projet "Rememly"
3. Cliquez sur **Deploy** → **Manage deployments**
4. Trouvez le dernier déploiement
5. Cliquez sur l'icône ⚙️ (Edit)
6. Configurez :
   - **Execute as**: Me (votre compte Google)
   - **Who has access**: Anyone (même anonyme)
7. Cliquez sur **Deploy**

### Deployment ID stable

```
AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf
```

---

## Déploiement du code

### Option 1 : Déploiement complet (recommandé)

```bash
./deploy-all.sh
```

Ce script :
1. Push le code backend vers Apps Script
2. Crée un nouveau déploiement @X
3. Build le frontend
4. Commit et push vers GitHub
5. Déploie sur GitHub Pages via `gh-pages`

### Option 2 : Backend uniquement

```bash
cd backend
npm run deploy
```

Ou manuellement :
```bash
cd backend
npx clasp push
npx clasp deploy -i AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf
```

### Option 3 : Frontend uniquement

```bash
cd frontend
npm run build
git add -A
git commit -m "Update frontend"
git push
```

Puis déployez sur GitHub Pages :
```bash
npm run deploy
```

---

## Développement local

### Mise à jour du fichier .env après déploiement backend

**⚠️ Important** : Après un déploiement backend, le fichier `frontend/.env` doit être mis à jour manuellement pour pointer vers la nouvelle version. Sinon, le serveur de développement local utilisera une ancienne version du backend.

```bash
# Dans frontend/.env, mettre à jour :
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
VITE_BACKEND_VERSION=<VERSION>
```

Exemple après un déploiement @45 :
```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf/exec
VITE_BACKEND_VERSION=45
```

### Lancer le serveur de développement

```bash
cd frontend
npm run dev
```

**IMPORTANT** : Le serveur DOIT tourner sur `http://localhost:3000/`

Si le port 3000 est occupé :
```bash
lsof -ti:3000 | xargs -r kill -9
npm run dev
```

### Checklist Développement Local

- [ ] Backend pushé via clasp (si modifié)
- [ ] Backend redéployé avec `clasp deploy`
- [ ] `frontend/.env` pointe vers la bonne URL backend
- [ ] `VITE_BACKEND_VERSION` à jour dans `frontend/.env`
- [ ] Serveur dev redémarré après modification du `.env`
- [ ] Version affichée correcte dans le menu (ex: `v1.2.0 / backend @45`)

---

## Vérification après déploiement

1. **Backend** : Vérifiez que le déploiement est accessible
   ```bash
   curl "https://script.google.com/macros/s/AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf/exec?path=ping"
   ```

2. **Frontend** : Vérifiez sur GitHub Pages
   - https://grut505.github.io/Rememly/

---

## Troubleshooting

### Le serveur démarre sur le mauvais port

```bash
lsof -ti:3000 | xargs -r kill -9
```

### clasp ne fonctionne pas sous WSL

**Solution** : Utiliser `npx clasp` depuis le dossier backend (clasp est installé localement via npm).

```bash
cd backend
npx clasp push
npx clasp deploy -i <deployment_id>
```

**Note** : Ne PAS utiliser la commande `clasp` globale (pointe vers Windows et bloque). Toujours utiliser `npx clasp`.

### La version backend affichée est incorrecte

Vérifier et synchroniser `VITE_BACKEND_VERSION` dans `.env` et `.env.production`, puis redémarrer le serveur de dev.

### Erreur CORS avec le backend

Vérifier que `VITE_APPS_SCRIPT_URL` pointe vers le bon deployment ID (pas @HEAD).

### Erreur 401 Unauthorized

**Cause** : Le Web App n'est pas configuré pour "Anyone"

**Solution** : Reconfigurez les permissions (voir Configuration initiale du Web App)

### Images ne s'affichent pas

**Cause** : Les fichiers Google Drive ne sont pas publics

**Solution** : Le code utilise `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)` automatiquement

---

## URLs importantes

| Service | URL |
|---------|-----|
| Dev local | http://localhost:3000/ |
| GitHub Main repo | https://grut505.github.io/ |
| GitHub Pages | https://github.com/Grut505/grut505.github.io |
| Backend | https://script.google.com/home/projects/122_ruL8YAsD0Mp8KUsUnf9tn_KA6wuhkWlOOwD2Tip6PsKwsviL9RqmT |
| GitHub | https://github.com/Grut505/Rememly |
| Google Cloud Client ID | https://console.cloud.google.com/auth/clients/175845978100-rqclosiat622f3b7ijpg17t2fnrnb522.apps.googleusercontent.com?project=rememly |

