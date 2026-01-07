// Articles CRUD operations

function handleArticlesList(params) {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Parse filters
  const year = params.year ? parseInt(params.year) : null;
  const limit = params.limit ? parseInt(params.limit) : 40;

  // Get articles (skip header row)
  const articles = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const article = {};

    headers.forEach((header, index) => {
      article[header] = row[index];
    });

    // Filter by year if specified
    if (year && article.year !== year) {
      continue;
    }

    // Filter by status
    if (article.status === 'DELETED') {
      continue;
    }

    articles.push(article);
  }

  // Sort by date_modification descending
  articles.sort((a, b) => {
    return new Date(b.date_modification).getTime() - new Date(a.date_modification).getTime();
  });

  // Apply limit
  const limited = articles.slice(0, limit);

  return createResponse({
    ok: true,
    data: {
      items: limited,
      next_cursor: articles.length > limit ? 'has_more' : null,
    },
  });
}

function handleArticleGet(id) {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === id) {
      const article = {};
      headers.forEach((header, index) => {
        article[header] = row[index];
      });

      return createResponse({
        ok: true,
        data: article,
      });
    }
  }

  return createResponse({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Article not found' },
  });
}

function handleArticleCreate(body) {
  const sheet = getArticlesSheet();

  const id = generateId();
  const dateNow = now();
  const dateModification = body.date_modification || dateNow;
  const year = getYear(dateModification);

  // Upload image to Drive
  const fileName = `${formatTimestamp()}_${id}_assembled.jpg`;
  const imageData = uploadImage(body.image.base64, fileName, year, 'assembled');

  // Create article row
  const row = [
    id,
    dateNow,
    dateModification,
    body.auteur,
    body.texte || '',
    imageData.url,
    imageData.fileId,
    year,
    body.assembly_state ? JSON.stringify(body.assembly_state) : '',
    body.full_page || false,
    'ACTIVE',
  ];

  sheet.appendRow(row);

  const article = {
    id,
    date_creation: dateNow,
    date_modification: dateModification,
    auteur: body.auteur,
    texte: body.texte || '',
    image_url: imageData.url,
    image_file_id: imageData.fileId,
    year,
    assembly_state: body.assembly_state ? JSON.stringify(body.assembly_state) : undefined,
    full_page: body.full_page || false,
  };

  return createResponse({
    ok: true,
    data: article,
  });
}

function handleArticleUpdate(body) {
  const sheet = getArticlesSheet();
  const rowIndex = findRowById(sheet, body.id);

  if (rowIndex === -1) {
    return createResponse({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Article not found' },
    });
  }

  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];
  const dateNow = now();

  // Update date_modification (use provided date or current time)
  const dateModification = body.date_modification || dateNow;
  row[2] = dateModification;

  // Update year based on date_modification
  const year = getYear(dateModification);
  row[7] = year;

  // Update texte if provided
  if (body.texte !== undefined) {
    row[4] = body.texte;
  }

  // Update image if provided
  if (body.image) {
    const fileName = `${formatTimestamp()}_${body.id}_assembled.jpg`;
    const imageData = uploadImage(body.image.base64, fileName, year, 'assembled');
    row[5] = imageData.url;
    row[6] = imageData.fileId;
  }

  // Update assembly_state if provided
  if (body.assembly_state !== undefined) {
    row[8] = body.assembly_state ? JSON.stringify(body.assembly_state) : '';
  }

  // Update full_page if provided
  if (body.full_page !== undefined) {
    row[9] = body.full_page;
  }

  sheet.getRange(rowIndex, 1, 1, 11).setValues([row]);

  const article = {
    id: row[0],
    date_creation: row[1],
    date_modification: row[2],
    auteur: row[3],
    texte: row[4],
    image_url: row[5],
    image_file_id: row[6],
    year: row[7],
    assembly_state: row[8],
    full_page: row[9],
  };

  return createResponse({
    ok: true,
    data: article,
  });
}

function handleArticleDelete(id) {
  const sheet = getArticlesSheet();
  const rowIndex = findRowById(sheet, id);

  if (rowIndex === -1) {
    return createResponse({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Article not found' },
    });
  }

  // Soft delete: mark as DELETED
  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];
  row[10] = 'DELETED'; // status column
  sheet.getRange(rowIndex, 1, 1, 11).setValues([row]);

  return createResponse({
    ok: true,
    data: { id, deleted: true },
  });
}
