const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeEncodedPayload(payload) {
  if (!payload) return '';
  const raw = String(payload);
  return raw.startsWith('v1:') ? raw.slice(3) : raw;
}

function deriveHmacBlock(keyBuffer, nonceBuffer, counter) {
  const counterBuffer = Buffer.alloc(4);
  counterBuffer.writeUInt32BE(counter, 0);
  return crypto.createHmac('sha256', keyBuffer).update(Buffer.concat([nonceBuffer, counterBuffer])).digest();
}

function decryptFamileoPassword(encrypted, key) {
  if (!encrypted || !key) return '';
  const encoded = normalizeEncodedPayload(encrypted);
  const payload = Buffer.from(encoded, 'base64');
  if (payload.length < 17) return '';
  const nonce = payload.subarray(0, 16);
  const cipher = payload.subarray(16);
  const keyBuffer = Buffer.from(String(key), 'utf8');
  const plain = Buffer.alloc(cipher.length);
  let counter = 0;
  for (let i = 0; i < cipher.length; i += 32) {
    const block = deriveHmacBlock(keyBuffer, nonce, counter++);
    const len = Math.min(32, cipher.length - i);
    for (let j = 0; j < len; j++) {
      plain[i + j] = cipher[i + j] ^ block[j];
    }
  }
  return plain.toString('utf8');
}

async function loginToFamileo() {
  const email = process.env.FAMILEO_EMAIL;
  const rawPassword = process.env.FAMILEO_PASSWORD;
  const encryptedPassword = process.env.FAMILEO_PASSWORD_ENC;
  const passwordKey = process.env.FAMILEO_PW_KEY;
  const password = rawPassword || decryptFamileoPassword(encryptedPassword, passwordKey);

  if (!email || !password) {
    console.error('Error: FAMILEO_EMAIL and password are required (FAMILEO_PASSWORD or FAMILEO_PASSWORD_ENC + FAMILEO_PW_KEY)');
    process.exit(1);
  }

  console.log('Starting Famileo login...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Go to login page
    console.log('Navigating to Famileo login page...');
    await page.goto('https://www.famileo.com/login', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for login form
    await page.waitForSelector('input[name="email"], input[type="email"], #email', { timeout: 10000 });

    // Fill in credentials
    console.log('Filling in credentials...');

    // Try different selectors for email field
    const emailSelector = await page.$('input[name="email"]') ||
                          await page.$('input[type="email"]') ||
                          await page.$('#email');

    const passwordSelector = await page.$('input[name="password"]') ||
                             await page.$('input[type="password"]') ||
                             await page.$('#password');

    if (!emailSelector || !passwordSelector) {
      throw new Error('Could not find login form fields');
    }

    await emailSelector.type(email, { delay: 50 });
    await passwordSelector.type(password, { delay: 50 });

    // Check "Remember me" if present - use evaluate to safely click
    try {
      const rememberMeClicked = await page.evaluate(() => {
        const checkbox = document.querySelector('input[name="_remember_me"], input[name="remember_me"], label[for*="remember"] input');
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          return true;
        }
        return false;
      });
      if (rememberMeClicked) {
        console.log('Checked "Remember me" checkbox');
      }
    } catch (e) {
      console.log('No remember me checkbox found or could not click it');
    }

    // Submit the form
    console.log('Submitting login form...');

    // Try clicking submit button first
    const submitted = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"], input[type="submit"], form button');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for navigation after login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // Check if login was successful by looking for indicators
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl);

    if (currentUrl.includes('login')) {
      // Still on login page, might have failed
      const errorElement = await page.$('.error, .alert-danger, [class*="error"]');
      if (errorElement) {
        const errorText = await page.evaluate(el => el.textContent, errorElement);
        throw new Error(`Login failed: ${errorText}`);
      }
    }

    // Get cookies
    console.log('Extracting cookies...');
    const cookies = await page.cookies();

    const phpSession = cookies.find(c => c.name === 'PHPSESSID');
    const rememberMeCookie = cookies.find(c => c.name === 'REMEMBERME');

    if (!phpSession) {
      console.log('Available cookies:', cookies.map(c => c.name));
      throw new Error('PHPSESSID cookie not found');
    }

    console.log('Successfully obtained session cookies!');

    // Save cookies to file for the next step
    const cookieData = {
      phpsessid: phpSession.value,
      rememberme: rememberMeCookie ? rememberMeCookie.value : '',
      timestamp: new Date().toISOString()
    };

    const outputPath = path.join(__dirname, 'cookies.json');
    fs.writeFileSync(outputPath, JSON.stringify(cookieData, null, 2));
    console.log(`Cookies saved to ${outputPath}`);

  } catch (error) {
    console.error('Login error:', error.message);

    // Take a screenshot for debugging
    const page = (await browser.pages())[0];
    if (page) {
      const screenshotPath = path.join(__dirname, 'error-screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved to ${screenshotPath}`);
    }

    process.exit(1);
  } finally {
    await browser.close();
  }
}

loginToFamileo();
