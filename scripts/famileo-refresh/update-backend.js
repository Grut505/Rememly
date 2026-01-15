const fs = require('fs');
const path = require('path');

async function updateBackend() {
  const backendUrl = process.env.BACKEND_URL;
  const secretToken = process.env.BACKEND_SECRET_TOKEN;

  if (!backendUrl || !secretToken) {
    console.error('Error: BACKEND_URL and BACKEND_SECRET_TOKEN environment variables are required');
    process.exit(1);
  }

  // Read cookies from previous step
  const cookiesPath = path.join(__dirname, 'cookies.json');
  if (!fs.existsSync(cookiesPath)) {
    console.error('Error: cookies.json not found. Run login.js first.');
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  console.log('Loaded cookies from', cookies.timestamp);

  // Call the backend API
  const url = `${backendUrl}?path=famileo/update-session`;

  console.log('Updating backend session...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: secretToken,
        phpsessid: cookies.phpsessid,
        rememberme: cookies.rememberme
      })
    });

    const result = await response.json();

    if (result.ok) {
      console.log('Backend session updated successfully!');
      console.log('Response:', result.data);
    } else {
      console.error('Backend update failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Request error:', error.message);
    process.exit(1);
  }

  // Clean up cookies file
  fs.unlinkSync(cookiesPath);
  console.log('Cleaned up temporary cookies file');
}

updateBackend();
