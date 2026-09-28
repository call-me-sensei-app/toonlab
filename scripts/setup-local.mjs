import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { applyCatalogSeeds, applyMigrations } from '../database/apply-sql.mjs';
import { closeDatabase } from '../database/client.mjs';
import { databaseInfo, providerConfiguration } from '../database/repository.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited with ${code}`)));
  });
}

function succeeds(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

async function composeCommand() {
  if (await succeeds('docker', ['compose', 'version'])) {
    return { command: 'docker', prefix: ['compose'] };
  }
  const desktopCompose = '/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose';
  if (
    process.platform === 'darwin'
    && existsSync(desktopCompose)
    && await succeeds(desktopCompose, ['version'])
  ) {
    return { command: desktopCompose, prefix: [] };
  }
  if (await succeeds('docker-compose', ['version'])) {
    return { command: 'docker-compose', prefix: [] };
  }
  throw new Error(
    'Docker Compose is not available. Install Docker Desktop, or install Docker Engine with the Compose plugin.',
  );
}

async function assertDockerEngineRunning() {
  if (await succeeds('docker', ['info'])) return;
  if (
    process.platform === 'darwin'
    && existsSync('/Applications/Docker.app')
  ) {
    throw new Error(
      'Docker Desktop is installed but its engine is not running. Open Docker Desktop, finish its first-run setup, wait until it reports that Docker is running, and run this command again.',
    );
  }
  throw new Error(
    'The Docker engine is not running. Start Docker and run this command again, or set DATABASE_URL to an existing Postgres service.',
  );
}

function databaseLabel(value) {
  if (!value) return 'postgresql://toonlab:***@127.0.0.1:55432/toonlab';
  try {
    const parsed = new URL(value);
    const username = parsed.username ? `${parsed.username}:***@` : '';
    return `${parsed.protocol}//${username}${parsed.host}${parsed.pathname}`;
  } catch {
    return 'configured external Postgres database';
  }
}

async function main() {
  const operation = process.argv.includes('--update') ? 'update' : 'setup';
  const localDefault = !process.env.DATABASE_URL
    || process.env.DATABASE_URL === 'postgresql://toonlab:toonlab@127.0.0.1:55432/toonlab';
  if (localDefault) {
    try {
      await assertDockerEngineRunning();
      const compose = await composeCommand();
      await run(compose.command, [...compose.prefix, 'up', '-d', '--wait', 'postgres']);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          'Docker is required for the bundled Postgres setup. Install Docker, or set DATABASE_URL to an existing Postgres service.',
        );
      }
      throw error;
    }
  }
  const migrations = await applyMigrations();
  const seeds = await applyCatalogSeeds();
  const info = await databaseInfo();
  const configuration = providerConfiguration();
  const migrationCount = migrations.filter(({ status }) => status !== 'unchanged').length;
  const seedCount = seeds.filter(({ status }) => status !== 'unchanged').length;
  const enabledProviders = Object.entries(configuration.providers)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  const database = databaseLabel(process.env.DATABASE_URL);
  process.stdout.write([
    '',
    `ToonLab ${operation} complete.`,
    `Database: ${database}`,
    `Schema migrations: ${migrationCount} applied, ${migrations.length - migrationCount} already current`,
    `Catalog datasets: ${seedCount} applied, ${seeds.length - seedCount} already current`,
    `Official catalog assets: ${info.catalog_count}${
      Number(info.catalog_count) === 0 ? ' (no verified release seed is checked in yet)' : ''
    }`,
    `BYO-key providers: ${enabledProviders.length ? enabledProviders.join(', ') : 'none configured'}`,
    operation === 'setup'
      ? 'Next: run npm run dev and open http://127.0.0.1:5175'
      : 'Local Library data was preserved. Restart npm run dev if it is already running.',
    '',
  ].join('\n'));
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `\nToonLab setup could not continue: ${
      error instanceof Error ? error.message : String(error)
    }\n\n`,
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
