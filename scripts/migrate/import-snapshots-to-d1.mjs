#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const TABLE_FILES = [
  'users',
  'articles',
  'jobs_pdf',
  'config',
  'families',
  'famileo_sessions',
  'famileo_imports',
  'app_logs',
]

function escapeSqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

function buildInsertStatements(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const columnSet = new Set()
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => columnSet.add(key))
  })

  const columns = Array.from(columnSet)
  return rows.map((row) => {
    const values = columns.map((column) => escapeSqlValue(row?.[column]))
    return `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
  })
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return []
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

const snapshotsDir = path.resolve(process.cwd(), getArg('--snapshots', 'scripts/migrate/snapshots'))
const outputFile = path.resolve(process.cwd(), getArg('--out', 'scripts/migrate/generated/import_snapshot.sql'))
const executeTarget = getArg('--execute', '')

const statements = ['BEGIN;']

for (const tableName of TABLE_FILES) {
  const filePath = path.join(snapshotsDir, `${tableName}.json`)
  const rows = loadJsonIfExists(filePath)
  statements.push(...buildInsertStatements(tableName, rows))
}

statements.push('COMMIT;')

fs.mkdirSync(path.dirname(outputFile), { recursive: true })
fs.writeFileSync(outputFile, `${statements.join('\n')}\n`, 'utf8')

process.stdout.write(`Wrote SQL seed file: ${outputFile}\n`)

if (executeTarget) {
  const workersDir = path.resolve(process.cwd(), 'workers')
  const args = ['wrangler', 'd1', 'execute', 'rememly-db', '--file', outputFile]
  if (executeTarget !== 'local') {
    args.push('--env', executeTarget)
  } else {
    args.push('--local')
  }

  const result = spawnSync('npx', args, {
    cwd: workersDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  process.exit(result.status || 0)
}
