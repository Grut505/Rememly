const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function loginToFamileo() {
  const email = process.env.FAMILEO_EMAIL;
  const password = process.env.FAMILEO_PASSWORD;

  if (!email || !password) {
    console.error('Error: FAMILEO_EMAIL and FAMILEO_PASSWORD environment variables are required');
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

    // Check "Remember me" if present
    const rememberMe = await page.$('input[name="remember_me"], input[type="checkbox"]');
    if (rememberMe) {
      await rememberMe.click();
    }

    // Submit the form
    console.log('Submitting login form...');
    const submitButton = await page.$('button[type="submit"], input[type="submit"]');
    if (submitButton) {
      await submitButton.click();
    } else {
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
