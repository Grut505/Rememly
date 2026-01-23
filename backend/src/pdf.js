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

    /* Mosaic cover page */
    .cover-mosaic {
      page-break-after: always;
      height: 27.7cm;
      display: flex;
      flex-direction: column;
    }

    .cover-title {
      text-align: center;
      padding: 0.5cm 0 0.8cm 0;
      flex-shrink: 0;
    }

    .cover-title h1 {
      font-size: 28pt;
      margin: 0 0 0.3cm 0;
      color: #333;
    }

    .cover-title .dates {
      font-size: 14pt;
      color: #666;
      margin: 0;
    }

    .mosaic-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .mosaic-cell {
      position: absolute;
      overflow: hidden;
      border-radius: 3px;
      background: #f0f0f0;
    }

    .mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
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
      height: 27.7cm;
      overflow: hidden;
    }

    .month-divider .page-number {
      position: absolute;
      bottom: 0;
      right: 0;
      z-index: 10;
    }

    /* Month mosaic background */
    .month-mosaic-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      opacity: 0.15;
    }

    .month-mosaic-cell {
      position: absolute;
      overflow: hidden;
    }

    .month-mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Seasonal fruits/vegetables decoration */
    .season-decorations {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 1;
    }

    .season-item {
      position: absolute;
      opacity: 0.85;
    }

    .season-item img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Month title overlay */
    .month-title-container {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 5;
    }

    .month-title {
      font-size: 42pt;
      font-weight: bold;
      color: #333;
      text-shadow: 2px 2px 8px rgba(255,255,255,0.9), -2px -2px 8px rgba(255,255,255,0.9), 2px -2px 8px rgba(255,255,255,0.9), -2px 2px 8px rgba(255,255,255,0.9);
      margin: 0;
      padding: 0.5cm 1.5cm;
      background: rgba(255,255,255,0.85);
      border-radius: 0.5cm;
    }

    .month-subtitle {
      font-size: 14pt;
      color: #666;
      margin-top: 0.3cm;
      text-shadow: 1px 1px 4px rgba(255,255,255,0.9);
    }
  </style>
</head>
<body>
  <!-- Cover Page with Mosaic -->
  ${generateCoverMosaic(articles, from, to)}
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

    // Get articles for this month
    const monthArticles = articlesByMonth[monthKey];

    // Month divider page
    currentPage++;
    html += generateMonthDivider(monthArticles, monthName, yearStr, monthIndex, currentPage, totalPages);

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

/**
 * Generate a mosaic cover page with all article images
 * Uses a dynamic "masonry-style" layout that respects image orientations
 */
function generateCoverMosaic(articles, from, to) {
  // Collect all images with their dimensions
  const images = [];

  for (const article of articles) {
    if (article.image_file_id) {
      try {
        const file = DriveApp.getFileById(article.image_file_id);
        const blob = file.getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());
        const mimeType = blob.getContentType();
        const imageBytes = blob.getBytes();
        const dimensions = getImageDimensions(imageBytes, mimeType);

        const isPortrait = dimensions && dimensions.height > dimensions.width;
        const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;

        images.push({
          base64,
          mimeType,
          isPortrait,
          aspectRatio
        });
      } catch (e) {
        // Skip failed images
      }
    }
  }

  if (images.length === 0) {
    return `
  <div class="cover">
    <h1>Livre de Souvenirs</h1>
    <p class="dates">${formatDateFr(from)} - ${formatDateFr(to)}</p>
  </div>
`;
  }

  // Available space
  const mosaicWidth = 19;  // cm
  const mosaicHeight = 22; // cm
  const gap = 0.12;        // cm between images

  // Generate layout based on image count and orientations
  const cells = generateDynamicLayout(images, mosaicWidth, mosaicHeight, gap);

  // Generate HTML for cells
  let mosaicHtml = '';
  for (const cell of cells) {
    mosaicHtml += `
        <div class="mosaic-cell" style="left: ${cell.x.toFixed(3)}cm; top: ${cell.y.toFixed(3)}cm; width: ${cell.w.toFixed(3)}cm; height: ${cell.h.toFixed(3)}cm;">
          <img src="data:${cell.img.mimeType};base64,${cell.img.base64}" alt="" />
        </div>`;
  }

  return `
  <div class="cover-mosaic">
    <div class="cover-title">
      <h1>Livre de Souvenirs</h1>
      <p class="dates">${formatDateFr(from)} - ${formatDateFr(to)}</p>
    </div>
    <div class="mosaic-container">
      ${mosaicHtml}
    </div>
  </div>
`;
}

/**
 * Generate a dynamic layout that adapts to image orientations
 * Uses a row-based approach where each row's height adapts to its content
 */
function generateDynamicLayout(images, totalWidth, totalHeight, gap) {
  const n = images.length;
  if (n === 0) return [];

  // Special cases for small counts
  if (n === 1) {
    return [{ img: images[0], x: 0, y: 0, w: totalWidth, h: totalHeight }];
  }

  if (n === 2) {
    // Side by side, respecting orientations
    const w1 = images[0].isPortrait ? totalWidth * 0.4 : totalWidth * 0.55;
    const w2 = totalWidth - w1 - gap;
    return [
      { img: images[0], x: 0, y: 0, w: w1, h: totalHeight },
      { img: images[1], x: w1 + gap, y: 0, w: w2, h: totalHeight }
    ];
  }

  if (n === 3) {
    // One large + two stacked, or three in row depending on orientations
    const portraitCount = images.filter(i => i.isPortrait).length;
    if (portraitCount >= 2) {
      // Big landscape on top, two portraits below
      const topH = totalHeight * 0.5;
      const botH = totalHeight - topH - gap;
      const halfW = (totalWidth - gap) / 2;
      return [
        { img: images[0], x: 0, y: 0, w: totalWidth, h: topH },
        { img: images[1], x: 0, y: topH + gap, w: halfW, h: botH },
        { img: images[2], x: halfW + gap, y: topH + gap, w: halfW, h: botH }
      ];
    } else {
      // One portrait left, two landscapes stacked right
      const leftW = totalWidth * 0.4;
      const rightW = totalWidth - leftW - gap;
      const halfH = (totalHeight - gap) / 2;
      return [
        { img: images[0], x: 0, y: 0, w: leftW, h: totalHeight },
        { img: images[1], x: leftW + gap, y: 0, w: rightW, h: halfH },
        { img: images[2], x: leftW + gap, y: halfH + gap, w: rightW, h: halfH }
      ];
    }
  }

  if (n === 4) {
    // 2x2 grid with size variations based on orientation
    const cells = [];
    const halfW = (totalWidth - gap) / 2;
    const halfH = (totalHeight - gap) / 2;

    cells.push({ img: images[0], x: 0, y: 0, w: halfW, h: halfH });
    cells.push({ img: images[1], x: halfW + gap, y: 0, w: halfW, h: halfH });
    cells.push({ img: images[2], x: 0, y: halfH + gap, w: halfW, h: halfH });
    cells.push({ img: images[3], x: halfW + gap, y: halfH + gap, w: halfW, h: halfH });
    return cells;
  }

  if (n === 5) {
    // Big one + 4 smaller, or 2 + 3 rows
    const topH = totalHeight * 0.55;
    const botH = totalHeight - topH - gap;
    const bigW = totalWidth * 0.55;
    const smallW = totalWidth - bigW - gap;
    const halfSmallH = (topH - gap) / 2;
    const thirdW = (totalWidth - 2 * gap) / 3;

    return [
      { img: images[0], x: 0, y: 0, w: bigW, h: topH },
      { img: images[1], x: bigW + gap, y: 0, w: smallW, h: halfSmallH },
      { img: images[2], x: bigW + gap, y: halfSmallH + gap, w: smallW, h: halfSmallH },
      { img: images[3], x: 0, y: topH + gap, w: (totalWidth - gap) / 2, h: botH },
      { img: images[4], x: (totalWidth - gap) / 2 + gap, y: topH + gap, w: (totalWidth - gap) / 2, h: botH }
    ];
  }

  if (n === 6) {
    // 2 rows of 3
    const halfH = (totalHeight - gap) / 2;
    const thirdW = (totalWidth - 2 * gap) / 3;
    const cells = [];
    for (let i = 0; i < 3; i++) {
      cells.push({ img: images[i], x: i * (thirdW + gap), y: 0, w: thirdW, h: halfH });
    }
    for (let i = 0; i < 3; i++) {
      cells.push({ img: images[3 + i], x: i * (thirdW + gap), y: halfH + gap, w: thirdW, h: halfH });
    }
    return cells;
  }

  // For 7+ images: use adaptive row-based layout
  return generateRowBasedLayout(images, totalWidth, totalHeight, gap);
}

/**
 * Row-based layout for larger image counts
 * Distributes images in rows, adapting cell widths to aspect ratios
 */
function generateRowBasedLayout(images, totalWidth, totalHeight, gap) {
  const n = images.length;

  // Determine number of rows based on image count
  let numRows;
  if (n <= 9) numRows = 3;
  else if (n <= 16) numRows = 4;
  else if (n <= 25) numRows = 5;
  else if (n <= 36) numRows = 6;
  else numRows = Math.ceil(Math.sqrt(n * (totalHeight / totalWidth)));

  // Distribute images to rows as evenly as possible
  const imagesPerRow = [];
  const basePerRow = Math.floor(n / numRows);
  let extra = n % numRows;

  for (let r = 0; r < numRows; r++) {
    imagesPerRow.push(basePerRow + (extra > 0 ? 1 : 0));
    if (extra > 0) extra--;
  }

  // Calculate row height
  const rowHeight = (totalHeight - (numRows - 1) * gap) / numRows;

  // Generate cells
  const cells = [];
  let imageIndex = 0;
  let currentY = 0;

  for (let r = 0; r < numRows; r++) {
    const rowImages = [];
    for (let i = 0; i < imagesPerRow[r] && imageIndex < n; i++) {
      rowImages.push(images[imageIndex++]);
    }

    if (rowImages.length === 0) continue;

    // Calculate width for each image in this row based on aspect ratios
    // Give portrait images slightly less width, landscape more
    const totalAspect = rowImages.reduce((sum, img) => {
      // Normalize: portrait gets weight ~0.7, landscape ~1.3, square ~1.0
      const weight = img.isPortrait ? 0.7 : (img.aspectRatio > 1.2 ? 1.3 : 1.0);
      return sum + weight;
    }, 0);

    let currentX = 0;
    const availableWidth = totalWidth - (rowImages.length - 1) * gap;

    for (let i = 0; i < rowImages.length; i++) {
      const img = rowImages[i];
      const weight = img.isPortrait ? 0.7 : (img.aspectRatio > 1.2 ? 1.3 : 1.0);
      const cellWidth = (weight / totalAspect) * availableWidth;

      cells.push({
        img: img,
        x: currentX,
        y: currentY,
        w: cellWidth,
        h: rowHeight
      });

      currentX += cellWidth + gap;
    }

    currentY += rowHeight + gap;
  }

  return cells;
}

/**
 * Generate a month divider page with mosaic background, seasonal fruits, and title
 */
function generateMonthDivider(monthArticles, monthName, year, monthIndex, currentPage, totalPages) {
  const monthYear = `${monthName} ${year}`;
  const articleCount = monthArticles.length;

  // Generate mini mosaic from month's images
  const mosaicHtml = generateMonthMosaic(monthArticles);

  // Get seasonal fruits for this month
  const fruitsHtml = generateSeasonalFruits(monthIndex);

  return `
  <div class="month-divider">
    <!-- Background mosaic from month's photos -->
    <div class="month-mosaic-bg">
      ${mosaicHtml}
    </div>

    <!-- Seasonal decorations (fruits/vegetables) -->
    <div class="season-decorations">
      ${fruitsHtml}
    </div>

    <!-- Month title -->
    <div class="month-title-container">
      <h2 class="month-title">${monthYear}</h2>
      <p class="month-subtitle">${articleCount} souvenir${articleCount > 1 ? 's' : ''}</p>
    </div>

    <div class="page-number">${currentPage} / ${totalPages}</div>
  </div>
`;
}

/**
 * Generate a small mosaic of images for the month divider background
 */
function generateMonthMosaic(monthArticles) {
  // Collect images from articles
  const images = [];

  for (const article of monthArticles) {
    if (article.image_file_id && images.length < 12) { // Limit to 12 images for performance
      try {
        const file = DriveApp.getFileById(article.image_file_id);
        const blob = file.getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());
        const mimeType = blob.getContentType();
        const imageBytes = blob.getBytes();
        const dimensions = getImageDimensions(imageBytes, mimeType);

        const isPortrait = dimensions && dimensions.height > dimensions.width;
        const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;

        images.push({
          base64,
          mimeType,
          isPortrait,
          aspectRatio
        });
      } catch (e) {
        // Skip failed images
      }
    }
  }

  if (images.length === 0) {
    return '';
  }

  // Generate a simple grid layout
  const mosaicWidth = 19;  // cm
  const mosaicHeight = 27.7; // cm
  const gap = 0.1;

  // Calculate grid dimensions
  const cols = images.length <= 4 ? 2 : (images.length <= 9 ? 3 : 4);
  const rows = Math.ceil(images.length / cols);

  const cellWidth = (mosaicWidth - (cols - 1) * gap) / cols;
  const cellHeight = (mosaicHeight - (rows - 1) * gap) / rows;

  let html = '';
  let imgIndex = 0;

  for (let r = 0; r < rows && imgIndex < images.length; r++) {
    for (let c = 0; c < cols && imgIndex < images.length; c++) {
      const img = images[imgIndex];
      const x = c * (cellWidth + gap);
      const y = r * (cellHeight + gap);

      html += `
        <div class="month-mosaic-cell" style="left: ${x.toFixed(2)}cm; top: ${y.toFixed(2)}cm; width: ${cellWidth.toFixed(2)}cm; height: ${cellHeight.toFixed(2)}cm;">
          <img src="data:${img.mimeType};base64,${img.base64}" alt="" />
        </div>`;
      imgIndex++;
    }
  }

  return html;
}

/**
 * Generate seasonal fruits/vegetables images positioned around the page edges
 * Images are positioned to frame the central content (title + mosaic)
 * Uses actual PNG images from SEASONAL_IMAGES constant
 */
function generateSeasonalFruits(monthIndex) {
  // Month index is 0-based, SEASONAL_IMAGES uses 1-based keys
  const monthKey = monthIndex + 1;
  const images = SEASONAL_IMAGES[monthKey] || [];

  if (images.length === 0) {
    return '';
  }

  // Positions around the page edges, avoiding the center content area
  // Page is 19cm wide x 27.7cm tall (after 1cm margins)
  // Center area (title + mosaic) is roughly from x:4 to x:15 and y:8 to y:20
  const positions = [
    // Top edge
    { x: 0.3, y: 0.3, size: 2.2 },
    { x: 3.5, y: 0.5, size: 1.8 },
    { x: 7.5, y: 0.2, size: 2.0 },
    { x: 11.5, y: 0.4, size: 1.9 },
    { x: 15.5, y: 0.3, size: 2.1 },
    // Right edge
    { x: 16.8, y: 3.5, size: 2.0 },
    { x: 17.0, y: 7.5, size: 1.7 },
    { x: 16.5, y: 11.5, size: 2.2 },
    { x: 17.0, y: 15.5, size: 1.8 },
    { x: 16.8, y: 19.5, size: 2.0 },
    { x: 16.5, y: 23.5, size: 1.9 },
    // Bottom edge
    { x: 0.5, y: 25.5, size: 2.0 },
    { x: 4.0, y: 25.2, size: 1.8 },
    { x: 8.0, y: 25.6, size: 2.1 },
    { x: 12.0, y: 25.3, size: 1.9 },
    { x: 15.5, y: 25.5, size: 2.0 },
    // Left edge
    { x: 0.2, y: 4.0, size: 1.9 },
    { x: 0.5, y: 8.0, size: 2.0 },
    { x: 0.3, y: 12.0, size: 1.8 },
    { x: 0.5, y: 16.0, size: 2.1 },
    { x: 0.2, y: 20.0, size: 1.9 },
    // Corners (slightly larger)
    { x: 16.0, y: 25.0, size: 2.3 },
    { x: 0.0, y: 0.0, size: 2.4 },
    { x: 16.5, y: 0.0, size: 2.3 },
  ];

  // Shuffle images to vary display
  const shuffled = [...images].sort(() => Math.random() - 0.5);

  let html = '';
  const usedPositions = Math.min(positions.length, shuffled.length);

  for (let i = 0; i < usedPositions; i++) {
    const pos = positions[i];
    const img = shuffled[i % shuffled.length];

    // Add slight rotation for visual interest (-15 to +15 degrees)
    const rotation = Math.floor(Math.random() * 30) - 15;

    html += `<div class="season-item" style="left: ${pos.x}cm; top: ${pos.y}cm; width: ${pos.size}cm; height: ${pos.size}cm; transform: rotate(${rotation}deg);">
      <img src="${img.data}" alt="${img.name}" />
    </div>`;
  }

  return html;
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
