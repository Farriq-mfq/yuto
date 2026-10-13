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
    expect((bca as { svg: string }).svg).toContain("<svg");
    expect(brandFor(" bri ", "bank")).toMatchObject({ kind: "logo" });
    expect((brandFor(" bri ", "bank") as { svg: string }).svg).toContain("<svg");
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
    expect((brandFor("BRIZZI", "bank") as { svg: string }).svg).toContain("<svg");
  });

  test("brand e-wallet dikenal -> logo", () => {
    expect(brandFor("GoPay", "ewallet")).toMatchObject({
      kind: "logo",
      label: "GoPay",
    });
    expect((brandFor("GoPay", "ewallet") as { svg: string }).svg).toContain("<svg");
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
    expect((brandFor("ShopeePay", "ewallet") as { svg: string }).svg).toContain("<svg");
    expect(brandFor("LinkAja", "ewallet")).toMatchObject({
      kind: "logo",
      label: "LinkAja",
    });
    expect(brandFor("ISAKU", "ewallet")).toMatchObject({ kind: "logo" });
    expect((brandFor("ISAKU", "ewallet") as { svg: string }).svg).toContain("<svg");
  });

  test("brand e-money dikenal -> logo", () => {
    expect(brandFor("Flazz", "bank")).toMatchObject({
      kind: "logo",
      label: "BCA Flazz",
    });
    expect((brandFor("Flazz", "bank") as { svg: string }).svg).toContain("<svg");
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

describe("brandCardBackground", () => {
  /** Luminansi relatif WCAG untuk hex #rrggbb. */
  function luminance(hex: string): number {
    const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(
      (part) => {
        const channel = parseInt(part, 16) / 255;
        return channel <= 0.03928
          ? channel / 12.92
          : Math.pow((channel + 0.055) / 1.055, 2.4);
      },
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** Rasio kontras WCAG dua warna hex. */
  function contrast(a: string, b: string): number {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
  }

  test("27 brand logo punya background hex valid", () => {
    const logos = BRAND_OPTIONS.flatMap((option) => {
      const brand = brandFor(option.name, option.kind);
      return brand?.kind === "logo" ? [{ option, brand }] : [];
    });
    expect(logos).toHaveLength(27);
    for (const { option, brand } of logos) {
      expect(
        brand.background,
        `background ${option.key} harus hex #rrggbb`,
      ).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  test("background kartu kontras AA (4.5:1) dengan teks putih", () => {
    for (const option of BRAND_OPTIONS) {
      const brand = brandFor(option.name, option.kind);
      if (brand?.kind !== "logo") continue;
      expect(
        contrast(brand.background, "#ffffff"),
        `kontras ${option.key} (${brand.background}) vs putih harus >= 4.5`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("brand tunai tetap tile (kartu default, bukan kartu berwarna)", () => {
    for (const key of ["tunai", "cash", "dompet"]) {
      expect(brandFor(DISPLAY_NAMES[key], "cash")).toMatchObject({
        kind: "tile",
      });
    }
  });
});
