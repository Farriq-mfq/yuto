import { useCallback, useEffect, useState } from "react";

/** Kunci localStorage untuk preferensi sembunyikan saldo (DESIGN_BRIEF §8). */
export const HIDE_BALANCE_KEY = "yuto-hide-balance";

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_BALANCE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Preferensi sembunyi-saldo untuk layar Dompet (+ detail akun).
 * Sengaja TIDAK dipakai di Home agar perubahan kecil dan terprediksi.
 */
export function useHideBalance(): [hidden: boolean, toggle: () => void] {
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === HIDE_BALANCE_KEY) setHidden(event.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDE_BALANCE_KEY, next ? "1" : "0");
      } catch {
        // Penyimpanan privat: preferensi sesi ini tetap jalan.
      }
      return next;
    });
  }, []);

  return [hidden, toggle];
}
