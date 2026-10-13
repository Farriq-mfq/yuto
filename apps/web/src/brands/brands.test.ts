import { describe, expect, test } from "bun:test";
import {
  brandFor,
  fallbackIconName,
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
