/**
 * Generate favicon.ico from public/favicon.svg using sharp + to-ico.
 * Run: node scripts/generate-favicon.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const icoPath = path.join(root, 'public', 'favicon.ico');

async function main() {
  const svg = fs.readFileSync(svgPath);
  const sizes = [16, 32];
  const pngs = await Promise.all(
    sizes.map((size) =>
      sharp(svg).resize(size, size).png().toBuffer()
    )
  );
  const ico = await toIco(pngs);
  fs.writeFileSync(icoPath, ico);
  console.log('Written', icoPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
