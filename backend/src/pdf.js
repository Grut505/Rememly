// PDF Generation

function handlePdfCreate(body, user) {
  const jobId = createJob(body.from, body.to, user.email);

  // Generate PDF synchronously (no trigger needed)
  try {
    updateJobStatus(jobId, 'RUNNING', 10);

    const job = getJobStatus(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    // Get articles in date range
    const articles = getArticlesInRange(job.date_from, job.date_to);

    updateJobStatus(jobId, 'RUNNING', 30);

    // Generate HTML with embedded images
    const html = generatePdfHtml(articles, job.year, job.date_from, job.date_to);

    updateJobStatus(jobId, 'RUNNING', 60);

    // Convert to PDF
    const pdfBlob = convertHtmlToPdf(html);

    updateJobStatus(jobId, 'RUNNING', 80);

    // Save to Drive - convert dates to strings in case they were parsed as Date objects by Sheets
    const dateFrom = typeof job.date_from === 'string' ? job.date_from : Utilities.formatDate(job.date_from, 'Europe/Paris', 'yyyy-MM-dd');
    const dateTo = typeof job.date_to === 'string' ? job.date_to : Utilities.formatDate(job.date_to, 'Europe/Paris', 'yyyy-MM-dd');
    const fileName = `Livre_${job.year}_${dateFrom}-${dateTo}_gen-${formatTimestamp()}_v01.pdf`;

    const pdfData = savePdfToFolder(pdfBlob, job.year, fileName);

    // Update job status
    updateJobStatus(jobId, 'DONE', 100, pdfData.fileId, pdfData.url);

    return createResponse({
      ok: true,
      data: {
        job_id: jobId,
        status: 'DONE',
        progress: 100,
        pdf_file_id: pdfData.fileId,
        pdf_url: pdfData.url,
      },
    });
  } catch (error) {
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(error));
    return createResponse({
      ok: false,
      error: { code: 'PDF_GENERATION_ERROR', message: String(error) },
    });
  }
}

function generatePdfAsync() {
  const jobId = PropertiesService.getScriptProperties().getProperty('CURRENT_PDF_JOB');
  if (!jobId) return;

  try {
    updateJobStatus(jobId, 'RUNNING', 10);

    const job = getJobStatus(jobId);
    if (!job) return;

    // Get articles in date range
    const articles = getArticlesInRange(job.date_from, job.date_to);

    updateJobStatus(jobId, 'RUNNING', 30);

    // Generate HTML
    const html = generatePdfHtml(articles, job.year, job.date_from, job.date_to);

    updateJobStatus(jobId, 'RUNNING', 60);

    // Convert to PDF
    const pdfBlob = convertHtmlToPdf(html);

    updateJobStatus(jobId, 'RUNNING', 80);

    // Save to Drive - convert dates to strings in case they were parsed as Date objects by Sheets
    const dateFrom = typeof job.date_from === 'string' ? job.date_from : Utilities.formatDate(job.date_from, 'Europe/Paris', 'yyyy-MM-dd');
    const dateTo = typeof job.date_to === 'string' ? job.date_to : Utilities.formatDate(job.date_to, 'Europe/Paris', 'yyyy-MM-dd');
    const fileName = `Livre_${job.year}_${dateFrom}-${dateTo}_gen-${formatTimestamp()}_v01.pdf`;

    const pdfData = savePdfToFolder(pdfBlob, job.year, fileName);

    // Update job status
    updateJobStatus(jobId, 'DONE', 100, pdfData.fileId, pdfData.url);

    // Clean up
    PropertiesService.getScriptProperties().deleteProperty('CURRENT_PDF_JOB');
  } catch (error) {
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(error));
    PropertiesService.getScriptProperties().deleteProperty('CURRENT_PDF_JOB');
  }
}

function getArticlesInRange(from, to) {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find the index of the 'date' column
  const dateIndex = headers.indexOf('date');
  if (dateIndex === -1) {
    throw new Error('Column "date" not found in Articles sheet');
  }

  const articles = [];
  const fromDate = new Date(from).getTime();
  // Add 1 day to 'to' date to include the entire end day
  const toDate = new Date(to).getTime() + (24 * 60 * 60 * 1000);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const article = {};
    headers.forEach((header, index) => {
      article[header] = row[index];
    });

    // Skip deleted articles
    if (article.status === 'DELETED') {
      continue;
    }

    // Parse the article date
    const articleDate = new Date(article.date).getTime();

    if (articleDate >= fromDate && articleDate <= toDate) {
      articles.push(article);
    }
  }

  // Sort by date
  articles.sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return articles;
}

function generatePdfHtml(articles, year, from, to) {
  const monthsFr = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ];

  // Group articles by month-year key
  const articlesByMonth = {};
  articles.forEach((article) => {
    const date = new Date(article.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    if (!articlesByMonth[key]) {
      articlesByMonth[key] = [];
    }
    articlesByMonth[key].push(article);
  });

  // Get sorted month keys (only months with articles)
  const monthKeys = Object.keys(articlesByMonth).sort();

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 1cm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
    }

    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 8cm;
    }

    .cover h1 {
      font-size: 36pt;
      margin-bottom: 1cm;
    }

    .cover .dates {
      font-size: 18pt;
      color: #666;
    }

    .articles-page {
      page-break-before: always;
      height: 27.7cm; /* A4 height (29.7cm) - 2cm margins */
      display: flex;
      flex-direction: column;
      gap: 0.6cm;
    }

    .article {
      flex: 1;
      border: 1px solid #ccc;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 13cm;
    }

    .article-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Layout for landscape images: photo fills width, date+description below */
    .article-content.landscape {
      flex-direction: column;
      align-items: stretch;
    }

    .article-content.landscape .article-image {
      width: 100%;
      display: flex;
      justify-content: flex-start;
    }

    .article-content.landscape .article-image img {
      width: 100%;
      max-height: 9.5cm;
      object-fit: contain;
      object-position: left top;
    }

    .article-content.landscape .article-bottom {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5cm;
      padding: 0.3cm;
    }

    .article-content.landscape .article-date {
      flex-shrink: 0;
    }

    .article-content.landscape .article-text {
      flex: 1;
    }

    /* Layout for portrait images: photo fills height on left, text right */
    .article-content.portrait {
      flex-direction: row;
      align-items: stretch;
    }

    .article-content.portrait .article-image {
      flex-shrink: 0;
      display: flex;
      align-items: stretch;
      margin-right: 0.4cm;
    }

    .article-content.portrait .article-image img {
      height: 100%;
      max-width: 10cm;
      object-fit: contain;
      object-position: left top;
    }

    .article-content.portrait .article-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 0.3cm;
      padding: 0.3cm 0.3cm 0.3cm 0;
    }

    .article-date {
      font-size: 11pt;
      color: #3366cc;
      font-weight: 500;
    }

    .article-text {
      font-size: 13pt;
      line-height: 1.4;
    }

    .page-number {
      text-align: right;
      font-size: 10pt;
      color: #666;
      padding-top: 0.3cm;
    }

    .month-divider {
      page-break-before: always;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 27.7cm;
      font-size: 32pt;
      font-weight: bold;
    }

    .month-divider .page-number {
      position: absolute;
      bottom: 0;
      right: 0;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover">
    <h1>Livre de Souvenirs</h1>
    <p class="dates">${formatDateFr(from)} - ${formatDateFr(to)}</p>
  </div>
`;

  // Calculate total pages: 1 cover + (month dividers + article pages)
  let totalPages = 1; // cover page
  for (const monthKey of monthKeys) {
    totalPages += 1; // month divider
    const monthArticles = articlesByMonth[monthKey];
    totalPages += Math.ceil(monthArticles.length / 2); // article pages (2 articles per page)
  }

  // Add month dividers and articles
  let currentPage = 1; // Start counting from page 2 (after cover)
  for (const monthKey of monthKeys) {
    const [yearStr, monthStr] = monthKey.split('-');
    const monthIndex = parseInt(monthStr);
    const monthName = monthsFr[monthIndex];
    const monthYear = `${monthName} ${yearStr}`;

    // Month divider page
    currentPage++;
    html += `  <div class="month-divider">${monthYear}<div class="page-number">${currentPage} / ${totalPages}</div></div>\n`;

    // Get articles for this month
    const monthArticles = articlesByMonth[monthKey];

    // Process articles 2 by 2
    for (let i = 0; i < monthArticles.length; i += 2) {
      currentPage++;
      html += `  <div class="articles-page">\n`;

      // First article
      const article1 = monthArticles[i];
      html += renderArticle(article1);

      // Second article (if exists)
      if (i + 1 < monthArticles.length) {
        const article2 = monthArticles[i + 1];
        html += renderArticle(article2);
      }

      html += `    <div class="page-number">${currentPage} / ${totalPages}</div>\n`;
      html += `  </div>\n`;
    }
  }

  html += `
</body>
</html>
`;

  return html;
}

function renderArticle(article) {
  const dateStr = formatDateTimeFr(article.date);

  // Get image as base64 and detect orientation
  let imageHtml = '';
  let isPortrait = false;

  if (article.image_file_id) {
    try {
      const file = DriveApp.getFileById(article.image_file_id);
      const blob = file.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      const mimeType = blob.getContentType();

      // Try to get image dimensions to detect portrait orientation
      const imageBytes = blob.getBytes();
      const dimensions = getImageDimensions(imageBytes, mimeType);
      if (dimensions && dimensions.height > dimensions.width) {
        isPortrait = true;
      }

      imageHtml = `<img src="data:${mimeType};base64,${base64}" alt="" />`;
    } catch (e) {
      // If image fails to load, skip it
      imageHtml = '';
    }
  }

  const textHtml = article.texte ? escapeHtml(article.texte) : '';

  if (isPortrait) {
    // Portrait: image left, date + description right (date above description)
    return `
    <div class="article">
      <div class="article-content portrait">
        <div class="article-image">${imageHtml}</div>
        <div class="article-right">
          <div class="article-date">${dateStr}</div>
          ${textHtml ? `<div class="article-text">${textHtml}</div>` : ''}
        </div>
      </div>
    </div>
`;
  } else {
    // Landscape: image top, date + description below (date left of description)
    return `
    <div class="article">
      <div class="article-content landscape">
        <div class="article-image">${imageHtml}</div>
        <div class="article-bottom">
          <div class="article-date">${dateStr}</div>
          ${textHtml ? `<div class="article-text">${textHtml}</div>` : ''}
        </div>
      </div>
    </div>
`;
  }
}

function getImageDimensions(bytes, mimeType) {
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return getJpegDimensions(bytes);
    } else if (mimeType === 'image/png') {
      return getPngDimensions(bytes);
    }
  } catch (e) {
    // If we can't detect, return null
  }
  return null;
}

function getJpegDimensions(bytes) {
  // JPEG dimensions are in SOF0 marker (0xFF 0xC0)
  for (let i = 0; i < bytes.length - 9; i++) {
    if (bytes[i] === -1 && (bytes[i + 1] === -64 || bytes[i + 1] === -62)) { // 0xFF 0xC0 or 0xFF 0xC2
      const height = (bytes[i + 5] << 8) | (bytes[i + 6] & 0xFF);
      const width = (bytes[i + 7] << 8) | (bytes[i + 8] & 0xFF);
      return { width: width, height: height };
    }
  }
  return null;
}

function getPngDimensions(bytes) {
  // PNG dimensions are at bytes 16-23 in the IHDR chunk
  if (bytes.length > 24) {
    const width = ((bytes[16] & 0xFF) << 24) | ((bytes[17] & 0xFF) << 16) | ((bytes[18] & 0xFF) << 8) | (bytes[19] & 0xFF);
    const height = ((bytes[20] & 0xFF) << 24) | ((bytes[21] & 0xFF) << 16) | ((bytes[22] & 0xFF) << 8) | (bytes[23] & 0xFF);
    return { width: width, height: height };
  }
  return null;
}

function formatDateFr(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const monthsFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${date.getDate()} ${monthsFr[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateTimeFr(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const monthsFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthsFr[date.getMonth()];
  const year = date.getFullYear();
  return `Le ${day} ${month} ${year}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function convertHtmlToPdf(html) {
  const htmlBlob = Utilities.newBlob(html, 'text/html', 'document.html');
  const pdfBlob = htmlBlob.getAs('application/pdf');
  return pdfBlob;
}
