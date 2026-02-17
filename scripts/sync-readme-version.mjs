import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const versionFilePath = path.join(rootDir, 'version.ts');
const readmePath = path.join(rootDir, 'README.md');

const versionFile = readFileSync(versionFilePath, 'utf8');
const versionMatch = versionFile.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);

if (!versionMatch) {
  throw new Error(`Unable to parse APP_VERSION from ${versionFilePath}`);
}

const appVersion = versionMatch[1];
const badgeUrl = `https://img.shields.io/badge/version-v${appVersion}-1f6feb?style=for-the-badge`;

const readme = readFileSync(readmePath, 'utf8');
const versionBadgePattern = /(<img alt="Version" src=")https:\/\/img\.shields\.io\/badge\/version-[^"]+(" \/>\s*)/;

if (!versionBadgePattern.test(readme)) {
  throw new Error(`Version badge not found in ${readmePath}`);
}

const updatedReadme = readme.replace(versionBadgePattern, `$1${badgeUrl}$2`);

if (updatedReadme !== readme) {
  writeFileSync(readmePath, updatedReadme, 'utf8');
  console.log(`Updated README version badge to v${appVersion}`);
} else {
  console.log(`README version badge already up-to-date (v${appVersion})`);
}
