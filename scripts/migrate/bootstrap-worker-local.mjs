#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const workersDir = path.join(repoRoot, 'workers')
const snapshotsDir = path.join(repoRoot, 'scripts', 'migrate', 'snapshots')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function hasSnapshots() {
  if (!fs.existsSync(snapshotsDir)) {
    return false
  }

  return fs.readdirSync(snapshotsDir).some((entry) => entry.endsWith('.json'))
}

process.stdout.write('Installing Worker dependencies...\n')
run('npm', ['install'], workersDir)

process.stdout.write('Applying local D1 migrations...\n')
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'rememly-db', '--local'], workersDir)

if (hasSnapshots()) {
  process.stdout.write('Importing local snapshots into D1...\n')
  run('node', ['scripts/migrate/import-snapshots-to-d1.mjs', '--execute', 'local'], repoRoot)
} else {
  process.stdout.write('No snapshot JSON files found in scripts/migrate/snapshots/. Skipping import.\n')
}

process.stdout.write('\nWorker local preparation is ready.\n')
process.stdout.write('Start the Worker with: npm run workers:dev\n')
