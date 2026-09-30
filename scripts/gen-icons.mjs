// Generates the app icons in public/icons from one SVG. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// Orange rounded tile with a white dumbbell. `pad` shrinks the glyph for maskable icons.
const svg = (pad = 0, rounded = true) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#d9651e"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)"
     fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round">
    <path d="M96 206v100M150 166v180M362 166v180M416 206v100M150 256h212"/>
  </g>
</svg>`;

const targets = [
  ['icon-192.png', 192, svg()],
  ['icon-512.png', 512, svg()],
  ['icon-maskable-512.png', 512, svg(0.25, false)],
  // iOS applies its own rounded mask, so the touch icon is square.
  ['apple-touch-icon.png', 180, svg(0.1, false)],
];

for (const [name, size, s] of targets) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(new URL(name, out).pathname);
}
writeFileSync(new URL('favicon.svg', out), svg().trim());
console.log('✔ Icons written to public/icons');
