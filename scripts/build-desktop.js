import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { getDb, checkpointDb, DB_PATH } from '../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function main() {
  console.log('1/4 Building React frontend (web/dist)...');
  execSync('npm run build:web', { cwd: PROJECT_ROOT, stdio: 'inherit' });

  console.log('2/4 Checkpointing SQLite WAL into luminaread.db...');
  const db = getDb(DB_PATH);
  checkpointDb(db);
  db.close();

  const outDir = path.join(PROJECT_ROOT, 'release');
  console.log('3/4 Packaging Windows desktop software via @electron/packager...');
  const appPaths = await packager({
    dir: PROJECT_ROOT,
    name: 'LuminaRead',
    platform: 'win32',
    arch: 'x64',
    out: outDir,
    overwrite: true,
    asar: false,
    prune: true,
    icon: path.join(PROJECT_ROOT, 'desktop', 'assets', 'icon.ico'),
    appBundleId: 'com.luminaread.desktop',
    win32metadata: {
      CompanyName: 'LuminaRead Studio',
      FileDescription: 'LuminaRead 流光精读 — 考研分级英文精读桌面软件',
      ProductName: 'LuminaRead 流光精读',
    },
    ignore: [
      /^\/release($|\/)/,
      /^\/data($|\/)/,
      /^\/web\/src($|\/)/,
      /^\/web\/node_modules($|\/)/,
      /^\/web\/android($|\/)/,
      /^\/web\/mobile-assets($|\/)/,
      /^\/\.git($|\/)/,
      /\.bat$/i,
    ],
  });

  const bundleDir = appPaths[0];
  console.log('4/4 Copying portable database into packaged app:', bundleDir);
  const targetDataDir = path.join(bundleDir, 'data');
  fs.mkdirSync(targetDataDir, { recursive: true });
  fs.copyFileSync(DB_PATH, path.join(targetDataDir, 'luminaread.db'));

  const exePath = path.join(bundleDir, 'LuminaRead.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error(`Expected executable missing at ${exePath}`);
  }
  const dbSizeMb = (fs.statSync(path.join(targetDataDir, 'luminaread.db')).size / 1024 / 1024).toFixed(2);
  console.log(`SUCCESS! Desktop software ready: ${exePath} (embedded DB: ${dbSizeMb} MB)`);
}

main().catch((err) => {
  console.error('Desktop build FAILED:', err);
  process.exit(1);
});
