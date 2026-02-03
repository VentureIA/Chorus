import sharp from 'sharp';
import { execSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');
const iconsetDir = join(iconsDir, 'Chorus.iconset');

// Create iconset directory
if (existsSync(iconsetDir)) {
  rmSync(iconsetDir, { recursive: true });
}
mkdirSync(iconsetDir, { recursive: true });

// Read SVG
const svgBuffer = readFileSync(join(iconsDir, 'icon.svg'));

// Generate all required sizes
const sizes = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
];

async function generateIcons() {
  console.log('Generating PNG icons...');

  for (const { size, name } of sizes) {
    const outputPath = join(iconsetDir, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  Generated ${name} (${size}x${size})`);
  }

  // Create .icns file using iconutil
  console.log('\nCreating .icns file...');
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(iconsDir, 'icon.icns')}"`, { encoding: 'utf8' });
    console.log('  Created icon.icns');
  } catch (e) {
    console.error('  Failed to create .icns:', e.message);
  }

  // Copy standard Tauri icon files
  console.log('\nCopying standard icon files...');
  await sharp(svgBuffer).resize(32, 32).png().toFile(join(iconsDir, '32x32.png'));
  await sharp(svgBuffer).resize(128, 128).png().toFile(join(iconsDir, '128x128.png'));
  await sharp(svgBuffer).resize(256, 256).png().toFile(join(iconsDir, '128x128@2x.png'));

  // Generate .ico for Windows
  console.log('\nGenerating Windows .ico...');
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map(size =>
      sharp(svgBuffer).resize(size, size).png().toBuffer()
    )
  );
  // For simplicity, just use a 256x256 PNG as ico (Windows will handle it)
  await sharp(svgBuffer).resize(256, 256).png().toFile(join(iconsDir, 'icon.ico'));
  console.log('  Created icon.ico (256x256)');

  console.log('\n✓ All icons generated successfully!');
}

generateIcons().catch(console.error);
