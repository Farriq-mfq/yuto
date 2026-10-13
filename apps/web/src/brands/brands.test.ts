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
  test("brand bank dikenal", () => {
    expect(brandFor("BCA", "bank")).toEqual({
      initials: "BC",
      background: "#0B3D91",
      foreground: "#fff",
    });
    expect(brandFor(" bri ", "bank")).toMatchObject({ foreground: "#fff" });
    expect(brandFor("B.T.N", "bank")).toMatchObject({ initials: "BT" });
  });

  test("brand e-wallet dikenal", () => {
    expect(brandFor("GoPay", "ewallet")).toMatchObject({ initials: "GP" });
    expect(brandFor("Go-Pay", "ewallet")).toMatchObject({ initials: "GP" });
    expect(brandFor("OVO", "ewallet")).toMatchObject({ initials: "OV" });
    expect(brandFor("DANA", "ewallet")).toMatchObject({ initials: "DA" });
    expect(brandFor("ShopeePay", "ewallet")).toMatchObject({ initials: "SP" });
    expect(brandFor("LinkAja", "ewallet")).toMatchObject({ initials: "LA" });
    expect(brandFor("ISAKU", "ewallet")).toMatchObject({ initials: "IS" });
  });

  test("brand e-money dikenal", () => {
    expect(brandFor("Flazz", "bank")).toMatchObject({ initials: "FL" });
    expect(brandFor("BRIZZI", "bank")).toMatchObject({ initials: "BR" });
    expect(brandFor("e-Money", "bank")).toMatchObject({ initials: "EM" });
    expect(brandFor("TapCash", "bank")).toMatchObject({ initials: "TA" });
    expect(brandFor("JakCard", "bank")).toMatchObject({ initials: "JK" });
  });

  test("brand tunai dikenal", () => {
    expect(brandFor("Tunai", "cash")).toMatchObject({ initials: "TU" });
    expect(brandFor("Dompet", "cash")).toMatchObject({ initials: "DO" });
  });

  test("institusi tak dikenal -> null", () => {
    expect(brandFor("Bank Asing Xyz", "bank")).toBeNull();
    expect(brandFor("", "cash")).toBeNull();
    expect(brandFor("   ", "ewallet")).toBeNull();
  });

  test("tipe asing tidak crash -> fallback aman", () => {
    expect(brandFor("Bank Asing Xyz", "crypto")).toBeNull();
    expect(brandFor("BCA", "crypto")).toMatchObject({ initials: "BC" });
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
