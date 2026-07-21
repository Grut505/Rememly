// Migration preparation helpers.
// These functions are manual utilities only and are not exposed as web app endpoints.

function mapSheetRowsToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) return [];
  const headers = data[0];
  const rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var hasValue = false;
    var item = {};

    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      if (!key) continue;
      var value = row[j];
      if (value !== '' && value !== null && value !== undefined) {
        hasValue = true;
      }
      item[key] = value instanceof Date ? value.toISOString() : value;
    }

    if (hasValue) {
      rows.push(item);
    }
  }

  return rows;
}

function buildMigrationSnapshotBundle() {
  const configRows = mapSheetRowsToObjects(getConfigSheet());
  const articleRows = mapSheetRowsToObjects(getArticlesSheet());
  const jobRows = mapSheetRowsToObjects(getJobsSheet());
  const userRows = mapSheetRowsToObjects(getUsersSheet());
  const familyRows = mapSheetRowsToObjects(getFamiliesSheet());
  const pdfLogRows = mapSheetRowsToObjects(getPdfLogsSheet()).map(function (row) {
    return {
      id: generateId(),
      category: 'pdf',
      level: row.level || 'INFO',
      message: row.message || '',
      context_json: JSON.stringify({ job_id: row.job_id || '', meta: row.meta || '' }),
      created_at: row.timestamp || new Date().toISOString(),
    };
  });
  const famileoLogRows = mapSheetRowsToObjects(getFamileoLogsSheet()).map(function (row) {
    return {
      id: generateId(),
      category: 'famileo',
      level: row.level || 'INFO',
      message: row.message || '',
      context_json: JSON.stringify({ user: row.user || '', meta: row.meta || '' }),
      created_at: row.timestamp || new Date().toISOString(),
    };
  });
  const configByKey = {};
  configRows.forEach(function (row) {
    configByKey[row.key] = row.value;
  });

  return {
    users: userRows.map(function (row) {
      return {
        id: generateId(),
        email: normalizeEmail(row.email || ''),
        name: '',
        pseudo: row.pseudo || '',
        role: '',
        status: row.status || 'ACTIVE',
        famileo_email: row.famileo_email || '',
        famileo_password_enc: row.famileo_password_enc || '',
        is_declared_author: row.status === 'ACTIVE' ? 1 : 0,
        created_at: row.date_created || new Date().toISOString(),
        updated_at: row.date_updated || row.date_created || new Date().toISOString(),
        famileo_name: row.famileo_name || '',
        avatar_url: row.avatar_url || '',
        avatar_file_id: row.avatar_file_id || '',
      };
    }),
    articles: articleRows.map(function (row) {
      return {
        id: row.id || generateId(),
        date: row.date instanceof Date ? row.date.toISOString() : row.date,
        auteur: row.auteur || '',
        author_pseudo: buildUserPseudoCache()[row.auteur] || '',
        texte: row.texte || '',
        image_url: row.image_url || '',
        image_file_id: row.image_file_id || '',
        assembly_state_json: row.assembly_state || '',
        full_page: row.full_page ? 1 : 0,
        status: row.status || 'ACTIVE',
        famileo_post_id: row.famileo_post_id || '',
        famileo_fingerprint: row.famileo_fingerprint || '',
        created_at: row.date instanceof Date ? row.date.toISOString() : (row.date || new Date().toISOString()),
        updated_at: row.date instanceof Date ? row.date.toISOString() : (row.date || new Date().toISOString()),
        deleted_at: row.status === 'DELETED' ? (row.date || new Date().toISOString()) : '',
      };
    }),
    jobs_pdf: jobRows.map(function (row) {
      return {
        job_id: row.job_id || generateId(),
        status: row.status || 'PENDING',
        progress: Number(row.progress || 0),
        progress_message: row.progress_message || '',
        pdf_file_id: row.pdf_file_id || '',
        pdf_url: row.pdf_url || '',
        chunks_folder_id: row.chunks_folder_id || '',
        chunks_folder_url: row.chunks_folder_url || '',
        created_at: row.created_at || new Date().toISOString(),
        created_by: row.created_by || '',
        created_by_pseudo: buildUserPseudoCache()[row.created_by] || '',
        date_from: row.date_from || '',
        date_to: row.date_to || '',
        error_message: row.error_message || '',
      };
    }),
    config: configRows,
    families: familyRows.map(function (row) {
      return {
        id: row.id || generateId(),
        name: row.name || '',
        famileo_id: row.famileo_id || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }),
    famileo_sessions: Object.keys(configByKey)
      .filter(function (key) { return key.indexOf('famileo_session') === 0; })
      .map(function (key) {
        try {
          var session = JSON.parse(configByKey[key] || '{}');
          var famileoEmail = key === 'famileo_session' ? '' : key.replace(/^famileo_session_/, '');
          return {
            famileo_email: famileoEmail,
            phpsessid: session.PHPSESSID || '',
            rememberme: session.REMEMBERME || '',
            updated_at: new Date().toISOString(),
            expires_at: '',
          };
        } catch (e) {
          return null;
        }
      })
      .filter(function (item) { return !!item; }),
    famileo_imports: articleRows
      .filter(function (row) { return !!row.famileo_post_id || !!row.famileo_fingerprint; })
      .map(function (row) {
        return {
          id: generateId(),
          post_id: row.famileo_post_id || '',
          fingerprint: row.famileo_fingerprint || '',
          article_id: row.id || '',
          imported_at: row.date instanceof Date ? row.date.toISOString() : (row.date || new Date().toISOString()),
        };
      }),
    app_logs: pdfLogRows.concat(famileoLogRows),
  };
}

function exportMigrationSnapshotsToDrive(folderName) {
  var rootName = folderName || 'Rememly Migration Snapshots';
  var folders = DriveApp.getFoldersByName(rootName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(rootName);
  var bundle = buildMigrationSnapshotBundle();
  var written = [];

  Object.keys(bundle).forEach(function (key) {
    var fileName = key + '.json';
    var content = JSON.stringify(bundle[key], null, 2);
    var matches = folder.getFilesByName(fileName);
    while (matches.hasNext()) {
      matches.next().setTrashed(true);
    }
    var file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    written.push({ name: file.getName(), id: file.getId(), url: file.getUrl() });
  });

  Logger.log('Migration snapshots exported to folder: ' + folder.getUrl());
  return {
    folder_id: folder.getId(),
    folder_url: folder.getUrl(),
    files: written,
  };
}
