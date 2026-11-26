import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(PROJECT_ROOT, 'web');
const ANDROID_DIR = path.join(WEB_DIR, 'android');
const ASSETS_DIR = path.join(WEB_DIR, 'mobile-assets');
const DIST_DIR = path.join(WEB_DIR, 'dist');
const JDK_HOME = 'C:\\Program Files\\Microsoft\\jdk-21.0.8.9-hotspot';

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(
    `Android SDK directory not found. Checked: ${candidates.join(', ')}`
  );
}

function semverToVersionCode(version) {
  const [maj = 1, min = 0, pat = 0] = String(version)
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  return maj * 10000 + min * 100 + pat;
}

function syncGradleVersion(version) {
  const gradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');
  let text = fs.readFileSync(gradlePath, 'utf-8');
  const code = semverToVersionCode(version);
  text = text
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  fs.writeFileSync(gradlePath, text, 'utf-8');
  return code;
}

export async function buildAndroidApk({ skipWebBuild = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const version = String(pkg.version || '1.1.0');
  const seedFile = path.join(ASSETS_DIR, 'seed-articles.json');
  const dictFile = path.join(ASSETS_DIR, 'compact-dict.json');

  if (!fs.existsSync(seedFile) || !fs.existsSync(dictFile)) {
    console.log('1/5 Exporting compact offline dictionary and 90 seed articles...');
    execSync('python scripts/export-mobile-assets.py', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (!skipWebBuild || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.log('2/5 Building React frontend (web/dist)...');
    execSync('npm run build:web', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  const copiedAssets = [
    path.join(DIST_DIR, 'seed-articles.json'),
    path.join(DIST_DIR, 'compact-dict.json'),
  ];
  try {
    console.log('3/5 Syncing mobile assets & web bundle into Capacitor Android...');
    fs.copyFileSync(seedFile, copiedAssets[0]);
    fs.copyFileSync(dictFile, copiedAssets[1]);
    execSync('npx cap sync android', { cwd: WEB_DIR, stdio: 'inherit' });
  } finally {
    for (const f of copiedAssets) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  const versionCode = syncGradleVersion(version);
  const sdkDir = resolveAndroidSdk();
  const escapedSdk = sdkDir.replace(/\\/g, '/');
  fs.writeFileSync(
    path.join(ANDROID_DIR, 'local.properties'),
    `sdk.dir=${escapedSdk}\n`,
    'utf-8'
  );

  const proxyArgs = [];
  const rawProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';
  if (rawProxy) {
    try {
      const pu = new URL(rawProxy.includes('://') ? rawProxy : `http://${rawProxy}`);
      const pHost = pu.hostname;
      const pPort = pu.port || (pu.protocol === 'https:' ? '443' : '80');
      proxyArgs.push(
        `-Dhttp.proxyHost=${pHost}`,
        `-Dhttp.proxyPort=${pPort}`,
        `-Dhttps.proxyHost=${pHost}`,
        `-Dhttps.proxyPort=${pPort}`
      );
    } catch {
      // ignore invalid proxy URL
    }
  } else {
    proxyArgs.push('-Djava.net.useSystemProxies=true');
  }
  const extraJvmOpts = proxyArgs.join(' ');

  console.log(`4/5 Compiling signed Release APK v${version} (versionCode=${versionCode})...`);
  const env = {
    ...process.env,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
    ...(fs.existsSync(JDK_HOME) ? { JAVA_HOME: JDK_HOME } : {}),
    JAVA_TOOL_OPTIONS: [process.env.JAVA_TOOL_OPTIONS, extraJvmOpts].filter(Boolean).join(' '),
    GRADLE_OPTS: [process.env.GRADLE_OPTS, extraJvmOpts].filter(Boolean).join(' '),
  };

  execFileSync('cmd.exe', ['/c', 'gradlew.bat', 'assembleRelease', ...proxyArgs], {
    cwd: ANDROID_DIR,
    env,
    stdio: 'inherit',
  });

  const builtApk = path.join(
    ANDROID_DIR,
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk'
  );
  if (!fs.existsSync(builtApk)) {
    throw new Error(`Signed APK not found at ${builtApk}`);
  }

  const releaseDir = path.join(PROJECT_ROOT, 'release');
  const updatesDir = path.join(releaseDir, 'updates');
  fs.mkdirSync(updatesDir, { recursive: true });

  const outRootApk = path.join(releaseDir, `LuminaRead-v${version}.apk`);
  const outUpdatesApk = path.join(updatesDir, `LuminaRead-v${version}.apk`);
  fs.copyFileSync(builtApk, outRootApk);
  fs.copyFileSync(builtApk, outUpdatesApk);

  const sha256 = computeSha256(outUpdatesApk);
  const size = fs.statSync(outUpdatesApk).size;
  console.log(
    `5/5 Android APK ready: ${outRootApk} (${(size / 1024 / 1024).toFixed(2)} MB, sha256=${sha256.slice(0, 12)}...)`
  );
  return {
    version,
    versionCode,
    apkPath: outUpdatesApk,
    rootApkPath: outRootApk,
    fileName: `LuminaRead-v${version}.apk`,
    size,
    sha256,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  buildAndroidApk().catch((err) => {
    console.error('Android APK build FAILED:', err);
    process.exit(1);
  });
}
