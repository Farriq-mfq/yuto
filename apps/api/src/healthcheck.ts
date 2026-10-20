// Docker healthcheck untuk kontainer `api`.
// Image runtime tidak punya curl, jadi pakai fetch milik Bun.
const port = process.env.PORT ?? "3000";

/** True bila /api/health menjawab 2xx (atau apa pun yang sukses). */
export async function isHealthy(url: string): Promise<boolean> {
  const response = await fetch(url).catch(() => null);
  return response?.ok ?? false;
}

if (import.meta.main) {
  const healthy = await isHealthy(`http://127.0.0.1:${port}/api/health`);
  if (!healthy) {
    console.error("Healthcheck gagal: /api/health tidak menjawab 2xx");
    process.exit(1);
  }
}
