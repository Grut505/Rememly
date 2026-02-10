const fs = require('fs');

async function fetchPassword() {
  const backendUrl = process.env.BACKEND_URL;
  const secretToken = process.env.BACKEND_SECRET_TOKEN;
  const famileoEmail = process.env.FAMILEO_EMAIL;
  const githubEnv = process.env.GITHUB_ENV;

  if (!backendUrl || !secretToken || !famileoEmail) {
    console.error('Error: BACKEND_URL, BACKEND_SECRET_TOKEN, and FAMILEO_EMAIL are required');
    process.exit(1);
  }

  if (!githubEnv) {
    console.error('Error: GITHUB_ENV is required to export workflow env vars');
    process.exit(1);
  }

  const url = `${backendUrl}?path=famileo/user-credentials`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: secretToken, famileo_email: famileoEmail })
  });

  const result = await response.json();
  if (!result.ok) {
    console.error('Failed to fetch credentials:', result.error || result);
    process.exit(1);
  }

  const passwordEnc = result.data && result.data.password_enc;
  const appEmail = result.data && result.data.user_email;
  const resolvedFamileoEmail = result.data && result.data.famileo_email;

  if (!passwordEnc || !resolvedFamileoEmail) {
    console.error('Missing password_enc or famileo_email in response');
    process.exit(1);
  }

  fs.appendFileSync(githubEnv, `FAMILEO_EMAIL=${resolvedFamileoEmail}\n`);
  if (appEmail) {
    fs.appendFileSync(githubEnv, `FAMILEO_APP_EMAIL=${appEmail}\n`);
  }
  fs.appendFileSync(githubEnv, `FAMILEO_PASSWORD_ENC=${passwordEnc}\n`);
}

fetchPassword().catch((error) => {
  console.error('Fetch credentials error:', error.message);
  process.exit(1);
});
