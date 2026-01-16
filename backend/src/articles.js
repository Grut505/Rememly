// Articles CRUD operations

function handleArticlesList(params) {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Parse filters
  const year = params.year ? parseInt(params.year) : null;
  const month = params.month ? params.month : null;
  const from = params.from ? new Date(params.from) : null;
  const to = params.to ? new Date(params.to) : null;
  const limit = params.limit ? parseInt(params.limit) : 40;
  const cursor = params.cursor ? parseInt(params.cursor) : 0; // Offset-based cursor
  const statusFilter = params.status_filter || 'active'; // 'active', 'all', or 'deleted'

  // Build a cache of email -> pseudo for all users
  const userPseudoCache = buildUserPseudoCache();

  // Get articles (skip header row)
  const articles = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const article = {};

    headers.forEach((header, index) => {
      article[header] = row[index];
    });

    // Add author_pseudo from cache (auteur contains email)
    article.author_pseudo = userPseudoCache[article.auteur] || 'Unknown';

    // Filter by status
    if (statusFilter === 'active' && article.status === 'DELETED') {
      continue;
    }
    if (statusFilter === 'deleted' && article.status !== 'DELETED') {
      continue;
    }

    // Parse date for filtering
    const articleDate = new Date(article.date);

    // Filter by year if specified
    if (year && articleDate.getFullYear() !== year) {
      continue;
    }

    // Filter by month if specified (format: "01", "02", etc.)
    if (month) {
      const articleMonth = (articleDate.getMonth() + 1).toString().padStart(2, '0');
      if (articleMonth !== month) {
        continue;
      }
    }

    // Filter by date range (from)
    if (from && articleDate < from) {
      continue;
    }

    // Filter by date range (to)
    if (to && articleDate > to) {
      continue;
    }

    articles.push(article);
  }

  // Sort by date descending
  articles.sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Apply cursor (offset) and limit
  const paginatedArticles = articles.slice(cursor, cursor + limit);
  const nextOffset = cursor + limit;
  const hasMore = nextOffset < articles.length;

  return createResponse({
    ok: true,
    data: {
      items: paginatedArticles,
      next_cursor: hasMore ? String(nextOffset) : null,
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

      // Add author_pseudo (auteur contains email)
      const user = findUserByEmail(article.auteur);
      article.author_pseudo = user ? user.pseudo : 'Unknown';

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
  const articleDate = body.date || dateNow;
  const year = getYear(articleDate);

  // Upload image to Drive
  const fileName = `${formatTimestamp()}_${id}_assembled.jpg`;
  const imageData = uploadImage(body.image.base64, fileName, year, 'assembled');

  // Create article row - 9 columns: id, date, auteur, texte, image_url, image_file_id, assembly_state, full_page, status
  const row = [
    id,                                                          // 0: id
    articleDate,                                                 // 1: date
    body.auteur,                                                 // 2: auteur
    body.texte || '',                                            // 3: texte
    imageData.url,                                               // 4: image_url
    imageData.fileId,                                            // 5: image_file_id
    body.assembly_state ? JSON.stringify(body.assembly_state) : '', // 6: assembly_state
    body.full_page || false,                                     // 7: full_page
    'ACTIVE',                                                    // 8: status
  ];

  sheet.appendRow(row);

  const article = {
    id,
    date: articleDate,
    auteur: body.auteur,
    texte: body.texte || '',
    image_url: imageData.url,
    image_file_id: imageData.fileId,
    assembly_state: body.assembly_state ? JSON.stringify(body.assembly_state) : undefined,
    full_page: body.full_page || false,
    status: 'ACTIVE',
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

  // 9 columns: id, date, auteur, texte, image_url, image_file_id, assembly_state, full_page, status
  const row = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
  const dateNow = now();

  const articleDate = body.date || dateNow;
  row[1] = articleDate; // date

  const year = getYear(articleDate);

  // Update texte if provided
  if (body.texte !== undefined) {
    row[3] = body.texte;
  }

  // Update image if provided
  if (body.image) {
    const fileName = `${formatTimestamp()}_${body.id}_assembled.jpg`;
    const imageData = uploadImage(body.image.base64, fileName, year, 'assembled');
    row[4] = imageData.url;      // image_url
    row[5] = imageData.fileId;   // image_file_id
  }

  // Update assembly_state if provided
  if (body.assembly_state !== undefined) {
    row[6] = body.assembly_state ? JSON.stringify(body.assembly_state) : '';
  }

  // Update full_page if provided
  if (body.full_page !== undefined) {
    row[7] = body.full_page;
  }

  // Update status if provided (for restore)
  if (body.status !== undefined) {
    row[8] = body.status;
  }

  sheet.getRange(rowIndex, 1, 1, 9).setValues([row]);

  const article = {
    id: row[0],
    date: row[1],
    auteur: row[2],
    texte: row[3],
    image_url: row[4],
    image_file_id: row[5],
    assembly_state: row[6],
    full_page: row[7],
    status: row[8],
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
  // 9 columns: id, date, auteur, texte, image_url, image_file_id, assembly_state, full_page, status
  const row = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
  row[8] = 'DELETED'; // status column (index 8)
  sheet.getRange(rowIndex, 1, 1, 9).setValues([row]);

  return createResponse({
    ok: true,
    data: { id, deleted: true },
  });
}
