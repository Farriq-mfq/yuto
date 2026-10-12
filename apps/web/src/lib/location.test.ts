import { describe, expect, test } from "bun:test";
import {
  formatCoords,
  hasPin,
  JAKARTA_CENTER,
  locationPayload,
  osmUrl,
} from "./location";

describe("hasPin", () => {
  test("needs both coordinates", () => {
    expect(
      hasPin({ latitude: -6.2, longitude: 106.85, locationName: "" }),
    ).toBe(true);
    expect(hasPin({ latitude: -6.2, longitude: null, locationName: "" })).toBe(
      false,
    );
    expect(hasPin({ latitude: null, longitude: null, locationName: "Kafe" })).toBe(
      false,
    );
  });
});

describe("formatCoords", () => {
  test("short fixed format", () => {
    expect(formatCoords(-6.2088123, 106.8455678)).toBe("-6.2088, 106.8456");
  });
});

describe("osmUrl", () => {
  test("points at the pin with a street-level zoom", () => {
    const url = osmUrl(-6.2, 106.85);
    expect(url.startsWith("https://www.openstreetmap.org/")).toBe(true);
    expect(url).toContain("mlat=-6.2");
    expect(url).toContain("mlon=106.85");
  });
});

describe("locationPayload", () => {
  test("sends coordinates plus trimmed name, never address", () => {
    expect(
      locationPayload({
        latitude: -6.2,
        longitude: 106.85,
        locationName: "  Kafe  ",
      }),
    ).toEqual({ latitude: -6.2, longitude: 106.85, locationName: "Kafe" });
  });

  test("drops a half pin and a blank name", () => {
    expect(
      locationPayload({ latitude: -6.2, longitude: null, locationName: "  " }),
    ).toEqual({});
    expect(
      locationPayload({ latitude: null, longitude: null, locationName: "" }),
    ).toEqual({});
  });

  test("name without a pin is still sent", () => {
    expect(
      locationPayload({ latitude: null, longitude: null, locationName: "Pasar" }),
    ).toEqual({ locationName: "Pasar" });
  });
});

describe("JAKARTA_CENTER", () => {
  test("defaults to Jakarta", () => {
    expect(JAKARTA_CENTER.lat).toBe(-6.2);
    expect(JAKARTA_CENTER.lng).toBe(106.85);
  });
});
