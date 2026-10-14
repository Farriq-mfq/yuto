import { describe, expect, test } from "bun:test";
import { createProxyCallback, toBindable, type ProxyConnection } from "./nativeProxy";
import { createStrictProxyHarness } from "./proxyHarness";

// Koneksi palsu perekam: tanpa eksekusi SQL, hanya mencatat urutan.
// Berbeda dari `proxyHarness.ts` (yang meniru KETATNYA plugin + mengeksekusi
// via bun): fake ini membuktikan PERILAKU ADAPTER — kontrol transaksi tak
// pernah bocor ke `run()`, tulis ter-buffer dan ter-flush atomik.
function fakeConnection(): ProxyConnection & {
  runs: Array<{ statement: string; values: unknown[] }>;
  queries: Array<{ statement: string; values: unknown[] }>;
  sets: Array<{ set: Array<{ statement: string; values?: unknown[] }>; transaction: boolean }>;
} {
  const runs: Array<{ statement: string; values: unknown[] }> = [];
  const queries: Array<{ statement: string; values: unknown[] }> = [];
  const sets: Array<{
    set: Array<{ statement: string; values?: unknown[] }>;
    transaction: boolean;
  }> = [];
  return {
    runs,
    queries,
    sets,
    async run(statement, values = []) {
      runs.push({ statement, values: [...values] });
    },
    async query(statement, values = []) {
      queries.push({ statement, values: [...values] });
      // why: meniru plugin — objek berurutan-kolom, BUKAN array.
      return { values: [{ id: "a", name: "x" }] };
    },
    async executeSet(set, transaction) {
      sets.push({ set: [...set], transaction });
    },
  };
}

describe("nativeProxy", () => {
  test("toBindable menormalkan boolean/undefined/Date", () => {
    expect(toBindable([true, false, undefined, new Date(1700000000000), 7, "x", null])).toEqual([
      1,
      0,
      null,
      1700000000000,
      7,
      "x",
      null,
    ]);
    expect(toBindable(undefined)).toEqual([]);
  });

  test("baca lewat query, tulis langsung lewat run di luar transaksi", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    // why: objek plugin → array posisional (kontrak select drizzle-proxy).
    const out = await callback('select "id", "name" from "x"', [], "all");
    expect(out).toEqual({ rows: [["a", "x"]] });
    expect(conn.queries).toHaveLength(1);
    const single = await callback('select "id" from "x" limit 1', [], "get");
    expect(single).toEqual({ rows: ["a", "x"] });
    await callback('insert into "x" values (?)', [true], "run");
    expect(conn.runs).toEqual([{ statement: 'insert into "x" values (?)', values: [1] }]);
    expect(conn.sets).toHaveLength(0);
  });

  test("transaksi: begin/commit tak bocor ke run, flush sekali via executeSet", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    await callback("begin", [], "run");
    await callback('insert into "t" values (?)', [1], "run");
    await callback('insert into "t" values (?)', [2], "run");
    await callback("commit", [], "run");
    expect(conn.runs).toHaveLength(0);
    expect(conn.sets).toHaveLength(1);
    expect(conn.sets[0]?.transaction).toBe(true);
    expect(conn.sets[0]?.set).toEqual([
      { statement: 'insert into "t" values (?)', values: [1] },
      { statement: 'insert into "t" values (?)', values: [2] },
    ]);
  });

  test("rollback membuang buffer; tulis berikut kembali langsung", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    await callback("begin", [], "run");
    await callback('insert into "t" values (?)', [1], "run");
    await callback("rollback", [], "run");
    await callback('insert into "t" values (?)', [2], "run");
    expect(conn.sets).toHaveLength(0);
    expect(conn.runs).toEqual([{ statement: 'insert into "t" values (?)', values: [2] }]);
  });

  test("transaksi tanpa tulis tak menyentuh native sama sekali", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    await callback("begin", [], "run");
    await callback("commit", [], "run");
    expect(conn.runs).toHaveLength(0);
    expect(conn.sets).toHaveLength(0);
  });

  test("begin nested ditolak dengan jelas", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    await callback("begin", [], "run");
    await expect(callback("begin", [], "run")).rejects.toThrow(/nested/);
  });

  test("savepoint (transaksi nested drizzle) ikut ter-buffer urut", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    await callback("begin", [], "run");
    await callback("savepoint sp0", [], "run");
    await callback('insert into "t" values (?)', [1], "run");
    await callback("release savepoint sp0", [], "run");
    await callback("commit", [], "run");
    expect(conn.sets).toHaveLength(1);
    expect(conn.sets[0]?.set.map((item) => item.statement)).toEqual([
      "savepoint sp0",
      'insert into "t" values (?)',
      "release savepoint sp0",
    ]);
  });

  test("baca di dalam transaksi diteruskan langsung via query", async () => {
    const conn = fakeConnection();
    const callback = createProxyCallback(conn);
    await callback("begin", [], "run");
    await callback('select "id" from "x"', [], "all");
    await callback("rollback", [], "run");
    expect(conn.queries).toHaveLength(1);
    expect(conn.sets).toHaveLength(0);
  });

  test("harness ketat meniru plugin: kontrol transaksi mentah ditolak", async () => {
    // why: bukti emulasi — persis inilah yang membuat kode lama (teruskan
    // `begin` mentah ke `conn.run()`) gagal simpan di perangkat sementara
    // lolos di bun:sqlite. Bila emulasi ini melemah, suite proxy kehilangan
    // daya reproduksinya.
    const harness = createStrictProxyHarness();
    await expect(harness.conn.run("begin")).rejects.toThrow(/nested/);
    await expect(harness.conn.run("commit")).rejects.toThrow(/nested/);
    await expect(harness.conn.run("rollback")).rejects.toThrow(/nested/);
  });

  test("harness ketat menolak boolean/undefined/Date/ISO ke SQL", async () => {
    // why: SQLite affinity bisa menyimpan TEXT ke kolom INTEGER sehingga
    // SUM/where rusak diam-diam. Suite perilaku yang lolos di atas berarti
    // tak satu pun bocor dari `LocalDataSource` (`parseOccurredAt` +
    // `toBindable` menutupnya).
    const harness = createStrictProxyHarness();
    await expect(
      harness.conn.run('insert into "t" values (?)', [true]),
    ).rejects.toThrow(/boolean/);
    await expect(
      harness.conn.run('insert into "t" values (?)', [undefined]),
    ).rejects.toThrow(/undefined/);
    await expect(
      harness.conn.run('insert into "t" values (?)', [new Date()]),
    ).rejects.toThrow(/Date/);
    await expect(
      harness.conn.run('insert into "t" values (?)', ["2026-05-01T10:00:00+07:00"]),
    ).rejects.toThrow(/ISO/);
  });
});
