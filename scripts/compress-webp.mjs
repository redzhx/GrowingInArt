import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function compressToWebp(filePath, quality = 80) {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(dir, `${name}.webp`);

  if (fs.existsSync(outputPath)) {
    console.log(`Skip: ${outputPath} (exists)`);
    return;
  }

  await sharp(filePath)
    .webp({ quality, effort: 6 })
    .toFile(outputPath);

  const originalSize = fs.statSync(filePath).size;
  const newSize = fs.statSync(outputPath).size;
  const saved = ((1 - newSize / originalSize) * 100).toFixed(1);

  console.log(`Compressed: ${outputPath} - ${saved}% smaller`);
}

async function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      await processDirectory(fullPath);
    } else if (stat.isFile() && stat.size > 1024 * 1024) { // > 1MB
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        await compressToWebp(fullPath);
      }
    }
  }
}

console.log('Compressing large images to WebP...');
await processDirectory(path.join(process.cwd(), 'public'));
console.log('Done!');
