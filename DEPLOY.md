# Guide de déploiement Rememly

## Configuration initiale du Web App (une seule fois)

### 1. Configuration Google Apps Script

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

### 2. Deployment ID à utiliser

Le deployment ID stable est : `AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf`

Cette URL est déjà configurée dans `frontend/.env.production`

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
5. Netlify déploie automatiquement

### Option 2 : Backend uniquement

```bash
cd backend
npm run deploy
```

**⚠️ Important** : Après `npm run deploy`, il faut configurer les permissions du nouveau déploiement (voir section Configuration Google Apps Script ci-dessus).

### Option 3 : Frontend uniquement

```bash
cd frontend
npm run build
git add -A
git commit -m "Update frontend"
git push
```

Netlify déploiera automatiquement.

## Vérification après déploiement

1. **Backend** : Vérifiez que le déploiement est accessible
   ```bash
   curl "https://script.google.com/macros/s/AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf/exec?path=ping"
   ```

2. **Frontend** : Attendez que Netlify déploie (1-2 minutes)
   - Dashboard : https://app.netlify.com
   - Vérifiez que le commit est déployé

## Problèmes courants

### Erreur 401 Unauthorized

**Cause** : Le Web App n'est pas configuré pour "Anyone"

**Solution** : Reconfigurez les permissions (voir Configuration Google Apps Script)

### Erreur CORS

**Cause** : Utilisation du déploiement @HEAD au lieu d'un déploiement Web App

**Solution** : Vérifiez que `frontend/.env.production` utilise le bon deployment ID

### Images ne s'affichent pas

**Cause** : Les fichiers Google Drive ne sont pas publics

**Solution** : Le code utilise `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)` automatiquement

## URLs importantes

- **Apps Script** : https://script.google.com
- **Netlify Dashboard** : https://app.netlify.com
- **App en production** : https://rememly.netlify.app
- **GitHub** : https://github.com/Grut505/Rememly
