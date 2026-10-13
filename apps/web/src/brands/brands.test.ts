import { describe, expect, test } from "bun:test";
import {
  BRAND_OPTIONS,
  DISPLAY_NAMES,
  brandFor,
  brandKeyFor,
  fallbackIconName,
  listInstitutions,
  normalizeInstitution,
} from "./index";

describe("normalizeInstitution", () => {
  test("lowercase + trim + hapus spasi/titik", () => {
    expect(normalizeInstitution(" BCA ")).toBe("bca");
    expect(normalizeInstitution("B.T.N")).toBe("btn");
    expect(normalizeInstitution("Bank Mandiri")).toBe("bankmandiri");
  });

  test("hapus strip agar Go-Pay -> gopay", () => {
    expect(normalizeInstitution("Go-Pay")).toBe("gopay");
    expect(normalizeInstitution("go_pay")).toBe("gopay");
  });

  test("case-insensitive", () => {
    expect(normalizeInstitution("bRi")).toBe("bri");
    expect(normalizeInstitution("ShopeePay")).toBe("shopeepay");
  });
});

describe("brandFor", () => {
  test("brand bank dikenal -> logo", () => {
    const bca = brandFor("BCA", "bank");
    expect(bca).toMatchObject({ kind: "logo", label: "BCA" });
    expect((bca as { src: string }).src).toMatch(/bca\.svg$/);
    expect(brandFor(" bri ", "bank")).toMatchObject({ kind: "logo" });
    expect((brandFor(" bri ", "bank") as { src: string }).src).toMatch(
      /bri\.svg$/,
    );
    expect(brandFor("B.T.N", "bank")).toMatchObject({
      kind: "logo",
      label: "BTN",
    });
    // Substring: "Bank Mandiri" tetap dapat logo Mandiri.
    expect(brandFor("Bank Mandiri", "bank")).toMatchObject({
      kind: "logo",
      label: "Mandiri",
    });
    // Longest-first: "BRIZZI" tidak tertelan "bri".
    expect(brandFor("BRIZZI", "bank")).toMatchObject({
      kind: "logo",
      label: "BRI BRIZZI",
    });
    expect((brandFor("BRIZZI", "bank") as { src: string }).src).toMatch(
      /bri-brizzi\.svg$/,
    );
  });

  test("brand e-wallet dikenal -> logo", () => {
    expect(brandFor("GoPay", "ewallet")).toMatchObject({
      kind: "logo",
      label: "GoPay",
    });
    expect((brandFor("GoPay", "ewallet") as { src: string }).src).toMatch(
      /gopay\.svg$/,
    );
    expect(brandFor("Go-Pay", "ewallet")).toMatchObject({ kind: "logo" });
    expect(brandFor("OVO", "ewallet")).toMatchObject({
      kind: "logo",
      label: "OVO",
    });
    expect(brandFor("DANA", "ewallet")).toMatchObject({
      kind: "logo",
      label: "DANA",
    });
    expect(brandFor("ShopeePay", "ewallet")).toMatchObject({
      kind: "logo",
      label: "ShopeePay",
    });
    expect((brandFor("ShopeePay", "ewallet") as { src: string }).src).toMatch(
      /shopee-pay\.svg$/,
    );
    expect(brandFor("LinkAja", "ewallet")).toMatchObject({
      kind: "logo",
      label: "LinkAja",
    });
    expect(brandFor("ISAKU", "ewallet")).toMatchObject({ kind: "logo" });
    expect((brandFor("ISAKU", "ewallet") as { src: string }).src).toMatch(
      /i-saku\.svg$/,
    );
  });

  test("brand e-money dikenal -> logo", () => {
    expect(brandFor("Flazz", "bank")).toMatchObject({
      kind: "logo",
      label: "BCA Flazz",
    });
    expect((brandFor("Flazz", "bank") as { src: string }).src).toMatch(
      /bca-flazz\.svg$/,
    );
    expect(brandFor("e-Money", "bank")).toMatchObject({
      kind: "logo",
      label: "Mandiri e-money",
    });
    expect(brandFor("TapCash", "bank")).toMatchObject({
      kind: "logo",
      label: "BNI TapCash",
    });
    expect(brandFor("JakCard", "bank")).toMatchObject({
      kind: "logo",
      label: "JakCard",
    });
  });

  test("brand tunai tetap tile", () => {
    expect(brandFor("Tunai", "cash")).toEqual({
      kind: "tile",
      initials: "TU",
      background: "#15803D",
      foreground: "#fff",
    });
    expect(brandFor("Dompet", "cash")).toEqual({
      kind: "tile",
      initials: "DO",
      background: "#475569",
      foreground: "#fff",
    });
    expect(brandFor("Cash", "cash")).toMatchObject({
      kind: "tile",
      initials: "CA",
    });
  });

  test("institusi tak dikenal -> null", () => {
    expect(brandFor("Bank Asing Xyz", "bank")).toBeNull();
    expect(brandFor("", "cash")).toBeNull();
    expect(brandFor("   ", "ewallet")).toBeNull();
  });

  test("tipe asing tidak crash -> fallback aman", () => {
    expect(brandFor("Bank Asing Xyz", "crypto")).toBeNull();
    expect(brandFor("BCA", "crypto")).toMatchObject({ kind: "logo" });
  });
});

describe("fallbackIconName", () => {
  test("fallback per tipe", () => {
    expect(fallbackIconName("bank")).toBe("landmark");
    expect(fallbackIconName("ewallet")).toBe("wallet");
    expect(fallbackIconName("cash")).toBe("banknote");
  });

  test("tipe asing/undefined aman -> wallet", () => {
    expect(fallbackIconName("crypto")).toBe("wallet");
    expect(fallbackIconName("")).toBe("wallet");
    expect(fallbackIconName(undefined)).toBe("wallet");
  });
});

describe("DISPLAY_NAMES + BRAND_OPTIONS", () => {
  test("30 kunci brand, tiap kunci punya nama proper non-kosong", () => {
    expect(BRAND_OPTIONS).toHaveLength(30);
    for (const option of BRAND_OPTIONS) {
      expect(option.key).not.toBe("");
      expect(option.name.trim()).not.toBe("");
      expect(DISPLAY_NAMES[option.key]).toBe(option.name);
    }
  });

  test("nama unik per kunci", () => {
    const names = BRAND_OPTIONS.map((option) => option.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("kunci tunai tetap ada", () => {
    const keys = BRAND_OPTIONS.map((option) => option.key);
    expect(keys).toContain("tunai");
    expect(keys).toContain("cash");
    expect(keys).toContain("dompet");
  });

  test("nama proper bank + e-wallet", () => {
    expect(DISPLAY_NAMES["bca"]).toBe("BCA");
    expect(DISPLAY_NAMES["mandiri"]).toBe("Bank Mandiri");
    expect(DISPLAY_NAMES["bri"]).toBe("BRI");
    expect(DISPLAY_NAMES["bni"]).toBe("BNI");
    expect(DISPLAY_NAMES["gopay"]).toBe("GoPay");
    expect(DISPLAY_NAMES["ovo"]).toBe("OVO");
    expect(DISPLAY_NAMES["dana"]).toBe("DANA");
    expect(DISPLAY_NAMES["shopeepay"]).toBe("ShopeePay");
    expect(DISPLAY_NAMES["linkaja"]).toBe("LinkAja");
    expect(DISPLAY_NAMES["isaku"]).toBe("i.saku");
  });

  test("e-money memakai nama produk", () => {
    expect(DISPLAY_NAMES["flazz"]).toBe("Flazz");
    expect(DISPLAY_NAMES["brizzi"]).toBe("BRIZZI");
    expect(DISPLAY_NAMES["emoney"]).toBe("e-Money");
    expect(DISPLAY_NAMES["tapcash"]).toBe("TapCash");
    expect(DISPLAY_NAMES["jakcard"]).toBe("JakCard");
  });

  test("tiap entri bertipe brand yang valid", () => {
    for (const option of BRAND_OPTIONS) {
      expect(["bank", "ewallet", "emoney", "cash"]).toContain(option.kind);
    }
    const byKey = Object.fromEntries(
      BRAND_OPTIONS.map((option) => [option.key, option.kind]),
    );
    expect(byKey["bca"]).toBe("bank");
    expect(byKey["gopay"]).toBe("ewallet");
    expect(byKey["flazz"]).toBe("emoney");
    expect(byKey["tunai"]).toBe("cash");
    expect(byKey["dompet"]).toBe("cash");
  });
});

describe("listInstitutions", () => {
  test("bank -> brand bank saja", () => {
    const options = listInstitutions("bank");
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(option.kind).toBe("bank");
    expect(options.map((o) => o.key)).toContain("bca");
  });

  test("ewallet -> e-wallet + e-money", () => {
    const options = listInstitutions("ewallet");
    const kinds = new Set(options.map((o) => o.kind));
    expect(kinds).toEqual(new Set(["ewallet", "emoney"]));
    const keys = options.map((o) => o.key);
    expect(keys).toContain("gopay");
    expect(keys).toContain("flazz");
  });

  test("cash -> tunai saja", () => {
    const options = listInstitutions("cash");
    for (const option of options) expect(option.kind).toBe("cash");
    expect(options.map((o) => o.key).sort()).toEqual(
      ["cash", "dompet", "tunai"],
    );
  });
});

describe("brandKeyFor", () => {
  test("exact + substring sama seperti brandFor", () => {
    expect(brandKeyFor("BCA")).toBe("bca");
    expect(brandKeyFor("Bank Mandiri")).toBe("mandiri");
    expect(brandKeyFor("BRIZZI")).toBe("brizzi");
    expect(brandKeyFor("Bank Asing Xyz")).toBeNull();
    expect(brandKeyFor("")).toBeNull();
    expect(brandKeyFor("   ")).toBeNull();
  });

  test("nama tampilan tiap opsi resolve balik ke kuncinya", () => {
    for (const option of BRAND_OPTIONS) {
      expect(brandKeyFor(option.name)).toBe(option.key);
    }
  });
});
