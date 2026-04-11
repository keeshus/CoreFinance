import fs from 'fs';
import path from 'path';

const version = process.argv[2];

if (!version) {
  console.error('Please provide a version (e.g., 1.2.3)');
  process.exit(1);
}

// Remove 'v' prefix if present
const cleanVersion = version.startsWith('v') ? version.substring(1) : version;

const packagePaths = [
  'package.json',
  'backend/package.json',
  'frontend/package.json',
  'worker/package.json'
];

packagePaths.forEach(relPath => {
  const fullPath = path.resolve(relPath);
  if (fs.existsSync(fullPath)) {
    const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    pkg.version = cleanVersion;
    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated ${relPath} to version ${cleanVersion}`);
  } else {
    console.warn(`Warning: ${relPath} not found`);
  }
});
