import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../../public/pwa");

function iconSvg(size, { maskable = false } = {}) {
  const scale = maskable ? 0.8 : 1;
  const offset = (size * (1 - scale)) / 2;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <rect width="512" height="512" fill="#315c43"/>
      <g transform="translate(${offset} ${offset}) scale(${scale})">
        <circle cx="256" cy="256" r="174" fill="#f7f7f4" opacity="0.14"/>
        <g fill="#ffffff">
          <ellipse cx="166" cy="205" rx="35" ry="44" transform="rotate(-24 166 205)"/>
          <ellipse cx="228" cy="166" rx="35" ry="45" transform="rotate(-8 228 166)"/>
          <ellipse cx="294" cy="166" rx="35" ry="45" transform="rotate(8 294 166)"/>
          <ellipse cx="356" cy="205" rx="35" ry="44" transform="rotate(24 356 205)"/>
          <path d="M261 224c-70 0-122 63-122 121 0 34 22 59 54 59 24 0 43-16 68-16s44 16 68 16c32 0 54-25 54-59 0-58-52-121-122-121z"/>
        </g>
        <circle cx="370" cy="357" r="58" fill="#f7f7f4" stroke="#315c43" stroke-width="12"/>
        <path d="M370 322v38l27 17" fill="none" stroke="#315c43" stroke-linecap="round" stroke-linejoin="round" stroke-width="13"/>
      </g>
    </svg>
  `;
}

const icons = [
  { filename: "whelping-icon-192.png", size: 192 },
  { filename: "whelping-icon-512.png", size: 512 },
  { filename: "whelping-icon-maskable-512.png", size: 512, maskable: true },
  { filename: "apple-touch-icon-180.png", size: 180 },
];

await mkdir(outputDirectory, { recursive: true });

for (const icon of icons) {
  const outputPath = resolve(outputDirectory, icon.filename);
  await sharp(Buffer.from(iconSvg(icon.size, { maskable: icon.maskable })))
    .resize(icon.size, icon.size)
    .flatten({ background: "#315c43" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}
