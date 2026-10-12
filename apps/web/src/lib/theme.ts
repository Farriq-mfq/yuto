import { useCallback, useEffect, useState } from "react";

/** Preferensi tema manual: "system" (default, ikut OS) | "light" | "dark". */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "yuto-theme";

/** Urutan siklus tombol toggle: system → light → dark → system. */
const CYCLE_ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Baca preferensi tersimpan; gagal baca / nilai asing → "system". */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // localStorage tidak tersedia (mode privat dsb.) → ikut sistem.
  }
  return "system";
}

/** Selesaikan preferensi menjadi gelap/terang (system → matchMedia OS). */
export function resolveDark(preference: ThemePreference): boolean {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Terapkan preferensi ke class `.dark` di <html> agar varian `dark:`
 * Tailwind aktif. Tanpa argumen: baca dari localStorage.
 */
export function applyThemePreference(
  preference: ThemePreference = readThemePreference(),
): void {
  document.documentElement.classList.toggle("dark", resolveDark(preference));
}

/** Simpan preferensi lalu terapkan ke DOM. */
export function persistThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Abaikan: tema tetap diterapkan untuk sesi ini.
  }
  applyThemePreference(preference);
}

export function nextThemePreference(
  current: ThemePreference,
): ThemePreference {
  const index = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length] ?? "system";
}

/**
 * State tema untuk tombol toggle: preferensi aktif, apakah gelap
 * ter-resolve saat ini, dan aksi siklus ke preferensi berikutnya.
 */
export function useTheme() {
  const [preference, setPreference] =
    useState<ThemePreference>(readThemePreference);
  const [isDark, setIsDark] = useState<boolean>(() =>
    resolveDark(readThemePreference()),
  );

  // Saat system: ikuti perubahan OS. Antar-tab: ikuti event storage.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncFromOs = () => {
      const current = readThemePreference();
      setPreference(current);
      setIsDark(resolveDark(current));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) syncFromOs();
    };
    media.addEventListener("change", syncFromOs);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", syncFromOs);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const cycle = useCallback(() => {
    setPreference((current) => {
      const next = nextThemePreference(current);
      persistThemePreference(next);
      setIsDark(resolveDark(next));
      return next;
    });
  }, []);

  return { preference, isDark, cycle };
}
