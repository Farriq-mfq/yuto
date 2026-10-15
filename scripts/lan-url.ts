// Cetak URL dev LAN untuk live reload native (dipakai script `cap:sync:dev`).
// Contoh: CAP_SERVER_URL=$(bun scripts/lan-url.ts) bunx cap sync
// Port mengikuti dev server Vite (default 5173).

const port = process.env.VITE_PORT ?? "5173";

const nets = Object.values(await import("node:os").then((m) =>
  m.default.networkInterfaces(),
)).flat() as Array<{ family: string; internal: boolean; address: string }>;

const v4 = nets.filter((n) => n?.family === "IPv4" && !n.internal);
// why: urutan = WiFi/LAN rumah dulu (192.168/10.x), terakhir 172.16-31
// yang sering milik adapter virtual (Docker/WSL) dan tak terjangkau HP.
const prio = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
const lan = prio
  .map((re) => v4.find((n) => re.test(n.address)))
  .find(Boolean) ?? v4[0];
if (!lan) throw new Error("tidak ada IPv4 non-internal (WiFi mati?)");
console.log(`http://${lan.address}:${port}`);
