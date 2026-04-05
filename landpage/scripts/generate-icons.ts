import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const staticDir = join(import.meta.dirname, '..', 'static');
const svg = readFileSync(join(staticDir, 'favicon.svg'));

// Generate PNGs at required sizes
for (const size of [16, 32, 192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(join(staticDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// Generate favicon.ico (multi-size: 16x16 + 32x32)
const ico = await pngToIco([
  join(staticDir, 'icon-16.png'),
  join(staticDir, 'icon-32.png'),
]);
writeFileSync(join(staticDir, 'favicon.ico'), ico);
console.log('✓ favicon.ico');

// Clean up intermediate PNGs
const { unlinkSync } = await import('fs');
unlinkSync(join(staticDir, 'icon-16.png'));
unlinkSync(join(staticDir, 'icon-32.png'));
console.log('✓ cleaned up intermediate files');

console.log('\nDone! Generated: favicon.ico, icon-192.png, icon-512.png');
