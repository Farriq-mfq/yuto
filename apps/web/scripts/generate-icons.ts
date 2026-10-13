/**
 * Generate PWA/raster icon files from the master logo.
 *
 * Source : apps/web/src/logo/yuto-icon-1024.png (1024px, transparent corners)
 * Output : apps/web/public/{icon-192,icon-512,maskable-512,
 *           apple-touch-icon,favicon-32x32,favicon-16x16}.png
 *
 * Run: `bun run generate-icons` (inside apps/web).
 *
 * - All outputs are opaque on the brand blue (#0152cb) so there is no
 *   transparency-padding issue anywhere (maskable is full-bleed by design).
 * - The maskable icon composites the logo at ~72% centered on the solid
 *   brand background, keeping the symbol inside the maskable safe zone.
 */
import sharp from "sharp";
import { join } from "node:path";

const SRC = join(import.meta.dir, "../src/logo/yuto-icon-1024.png");
const PUBLIC = join(import.meta.dir, "../public");
const BRAND = "#0152cb";

async function main() {
  const master = sharp(SRC);

  // Standard icons + favicons: resize, flatten onto opaque brand background.
  const flats: Array<[string, number]> = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
    ["favicon-32x32.png", 32],
    ["favicon-16x16.png", 16],
  ];
  for (const [name, size] of flats) {
    await master
      .clone()
      .resize(size, size)
      .flatten({ background: BRAND })
      .png()
      .toFile(join(PUBLIC, name));
    console.log(`wrote public/${name} (${size}x${size})`);
  }

  // Maskable: full-bleed solid background + logo at ~72% centered.
  const size = 512;
  const logoSize = Math.round(size * 0.72);
  const logo = await master
    .clone()
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(join(PUBLIC, "maskable-512.png"));
  console.log(`wrote public/maskable-512.png (${size}x${size}, full-bleed)`);
}

await main();
