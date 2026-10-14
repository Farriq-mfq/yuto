/**
 * Generate ikon launcher Android dari logo master Yuto.
 *
 * Source : apps/web/src/logo/yuto-icon-1024.png (1024px, biru #0152cb)
 * Output : mipmap-mdpi s.d. mipmap-xxxhdpi, masing-masing berisi
 *          ic_launcher.png, ic_launcher_round.png,
 *          ic_launcher_foreground.png
 *
 * Run: `bun run generate-android-icons` (inside apps/web).
 *
 * Konvensi adaptive icon Android:
 * - legacy `ic_launcher(.png)` + `ic_launcher_round(.png)`:
 *   mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192.
 * - `ic_launcher_foreground(.png)` (dirujuk `mipmap-anydpi-v26/*.xml`
 *   di atas `@color/ic_launcher_background`): 108dp per density =
 *   mdpi 108, hdpi 162, xhdpi 216, xxhdpi 324, xxxhdpi 432.
 *
 * Semua PNG opaque penuh-bleed di atas biru brand (#0152cb, sama dengan
 * `@color/ic_launcher_background`) — sudut transparan logo master
 * di-flatten agar tak ada garis tepi bila warna background dan art
 * sedikit berbeda, dan masker launcher (lingkaran/squircle) memotong
 * area yang semuanya biru.
 */
import sharp from "sharp";
import { join } from "node:path";

const RES = join(import.meta.dir, "../android/app/src/main/res");
const SRC = join(import.meta.dir, "../src/logo/yuto-icon-1024.png");
const BRAND = "#0152cb";

const DENSITIES: Array<[string, number, number]> = [
  // [dir, legacy, foreground]
  ["mipmap-mdpi", 48, 108],
  ["mipmap-hdpi", 72, 162],
  ["mipmap-xhdpi", 96, 216],
  ["mipmap-xxhdpi", 144, 324],
  ["mipmap-xxxhdpi", 192, 432],
];

function circleMask(size: number): Buffer {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
  );
}

async function main() {
  const master = sharp(SRC);
  const meta = await master.metadata();
  if (meta.width !== 1024 || meta.height !== 1024) {
    throw new Error(`Logo master harus 1024x1024, terbaca ${meta.width}x${meta.height}.`);
  }

  for (const [dir, legacy, foreground] of DENSITIES) {
    // Legacy square + foreground: logo penuh-bleed di atas biru brand.
    for (const [name, size] of [
      ["ic_launcher.png", legacy],
      ["ic_launcher_foreground.png", foreground],
    ] as const) {
      await master
        .clone()
        .resize(size, size)
        .flatten({ background: BRAND })
        .png()
        .toFile(join(RES, dir, name));
      console.log(`wrote ${dir}/${name} (${size}x${size})`);
    }
    // Legacy round: sama, lalu potong lingkaran (masker launcher
    // memotong sudut yang semuanya biru brand).
    const logo = await master
      .clone()
      .resize(legacy, legacy)
      .flatten({ background: BRAND })
      .png()
      .toBuffer();
    await sharp(logo)
      .composite([{ input: circleMask(legacy), blend: "dest-in" }])
      .png()
      .toFile(join(RES, dir, "ic_launcher_round.png"));
    console.log(`wrote ${dir}/ic_launcher_round.png (${legacy}x${legacy})`);
  }
}

await main();
