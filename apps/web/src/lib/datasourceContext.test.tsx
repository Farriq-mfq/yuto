import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { DataSource } from "./datasource";
import { DataSourceProvider, useDataSource } from "./datasourceContext";
import { HttpDataSource } from "./httpDataSource";

function probe(onValue: (ds: DataSource) => void) {
  function Probe() {
    onValue(useDataSource());
    return null;
  }
  return renderToString(
    <DataSourceProvider>
      <Probe />
    </DataSourceProvider>,
  );
}

describe("DataSourceProvider", () => {
  test("default memakai singleton HttpDataSource yang stabil", () => {
    const seen: DataSource[] = [];
    probe((ds) => seen.push(ds));
    probe((ds) => seen.push(ds));
    expect(seen[0]).toBeInstanceOf(HttpDataSource);
    expect(seen[1]).toBe(seen[0]);
  });

  test("value kustom dipakai apa adanya (untuk test/implementasi lain)", () => {
    const custom = new HttpDataSource();
    const seen: DataSource[] = [];
    function Probe() {
      seen.push(useDataSource());
      return null;
    }
    renderToString(
      <DataSourceProvider value={custom}>
        <Probe />
      </DataSourceProvider>,
    );
    expect(seen[0]).toBe(custom);
  });
});
