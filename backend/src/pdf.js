// PDF Generation

function handlePdfCreate(body, user) {
  const jobId = createJob(body.from, body.to, user.email);

  // Trigger async generation
  ScriptApp.newTrigger('generatePdfAsync')
    .timeBased()
    .after(1000)
    .create();

  // Store job ID in properties for the trigger
  PropertiesService.getScriptProperties().setProperty('CURRENT_PDF_JOB', jobId);

  return createResponse({
    ok: true,
    data: { job_id: jobId },
  });
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

    // Save to Drive
    const fileName = `Livre_${job.year}_${job.date_from.substring(0, 10)}-${job.date_to.substring(
      0,
      10
    )}_gen-${formatTimestamp()}_v01.pdf`;

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

  const articles = [];
  const fromDate = new Date(from).getTime();
  const toDate = new Date(to).getTime();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const modificationDate = new Date(row[2]).getTime();

    if (modificationDate >= fromDate && modificationDate <= toDate) {
      const article = {};
      headers.forEach((header, index) => {
        article[header] = row[index];
      });

      if (article.status !== 'DELETED') {
        articles.push(article);
      }
    }
  }

  // Sort by date_modification
  articles.sort((a, b) => {
    return new Date(a.date_modification).getTime() - new Date(b.date_modification).getTime();
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

  // Group articles by month
  const articlesByMonth = {};
  articles.forEach((article) => {
    const month = new Date(article.date_modification).getMonth();
    if (!articlesByMonth[month]) {
      articlesByMonth[month] = [];
    }
    articlesByMonth[month].push(article);
  });

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
    }

    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 5cm;
    }

    .cover h1 {
      font-size: 36pt;
      margin-bottom: 2cm;
    }

    .month-divider {
      page-break-before: always;
      text-align: center;
      padding: 8cm 0;
      font-size: 32pt;
      font-weight: bold;
    }

    .article {
      border: 1px solid #000;
      padding: 1cm;
      margin-bottom: 1cm;
      page-break-inside: avoid;
    }

    .article img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto 1cm;
    }

    .article-text {
      text-align: center;
      font-size: 16pt;
      margin-bottom: 0.5cm;
    }

    .article-meta {
      text-align: center;
      font-size: 12pt;
      color: #666;
    }

    .page-number {
      text-align: center;
      font-size: 10pt;
      color: #999;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover">
    <h1>Livre de l'année ${year}</h1>
  </div>
`;

  // Add month dividers and articles
  for (let month = 0; month < 12; month++) {
    const monthName = monthsFr[month];
    html += `  <div class="month-divider">${monthName} ${year}</div>\n`;

    const monthArticles = articlesByMonth[month] || [];
    monthArticles.forEach((article) => {
      const date = new Date(article.date_modification);
      const day = date.getDate();
      const monthStr = monthsFr[date.getMonth()].toLowerCase();

      html += `
  <div class="article">
    <img src="${article.image_url}" alt="" />
    ${article.texte ? `<div class="article-text">${article.texte}</div>` : ''}
    <div class="article-meta">${article.auteur} · ${day} ${monthStr}</div>
  </div>
`;
    });
  }

  html += `
</body>
</html>
`;

  return html;
}

function convertHtmlToPdf(html) {
  const htmlBlob = Utilities.newBlob(html, 'text/html', 'document.html');
  const pdfBlob = htmlBlob.getAs('application/pdf');
  return pdfBlob;
}
