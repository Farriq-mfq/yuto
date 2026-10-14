import { describe, expect, test } from "bun:test";
import { AutoSyncDataSource } from "./autoSync";
import type { DataSource } from "../datasource";

// why: guard `shouldSync` + injeksi `schedule` membuat guard teruji tanpa
// menunggu debounce nyata (SYNC_DEBOUNCE_MS) maupun timer modul scheduler.

function fakeDataSource(): DataSource {
  return {
    createAccount: async () => {},
  } as unknown as DataSource;
}

describe("AutoSyncDataSource shouldSync guard", () => {
  test("guard false → penjadwalan dilewati", async () => {
    let scheduled = 0;
    const ds = new AutoSyncDataSource(
      fakeDataSource(),
      () => false,
      () => {
        scheduled++;
      },
    );
    await ds.createAccount({} as never);
    // why: guard async via microtask — beri satu tick sebelum assert.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scheduled).toBe(0);
  });

  test("guard true → dijadwalkan sekali", async () => {
    let scheduled = 0;
    const ds = new AutoSyncDataSource(
      fakeDataSource(),
      () => true,
      () => {
        scheduled++;
      },
    );
    await ds.createAccount({} as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scheduled).toBe(1);
  });

  test("tanpa guard → perilaku lama (dijadwalkan)", async () => {
    let scheduled = 0;
    const ds = new AutoSyncDataSource(fakeDataSource(), undefined, () => {
      scheduled++;
    });
    await ds.createAccount({} as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scheduled).toBe(1);
  });

  test("tulis gagal → guard tak dipanggil, error diteruskan", async () => {
    let guardCalls = 0;
    const failing = {
      createAccount: async () => {
        throw new Error("gagal tulis");
      },
    } as unknown as DataSource;
    const ds = new AutoSyncDataSource(
      failing,
      () => {
        guardCalls++;
        return true;
      },
      () => {},
    );
    await expect(
      ds.createAccount({} as never),
    ).rejects.toThrow("gagal tulis");
    expect(guardCalls).toBe(0);
  });
});
