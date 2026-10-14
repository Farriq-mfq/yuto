import { describe, test } from "bun:test";
import { defineDataSourceBehavior } from "./datasource.behavior.test";
import { createLocalDataSource } from "./local/factory";

/**
 * Suite kontrak DataSource yang SAMA untuk LocalDataSource.
 * Tiap test mendapat database `:memory:` fresh (factory dipanggil per test
 * oleh suite) + migrate + seed, jadi isolasi terbaik tanpa cleanup antar
 * test. `login()` lokal no-op sehingga password ctx diabaikan.
 */
describe("LocalDataSource against a fresh :memory: database", () => {
  defineDataSourceBehavior(
    () => createLocalDataSource(":memory:"),
    { baseUrl: "local", password: "local-noop" },
    test,
  );
});
