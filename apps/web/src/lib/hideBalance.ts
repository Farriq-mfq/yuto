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
 * Preferensi sembunyi-saldo (satu sumber di localStorage), dipakai Dompet
 * (+ detail akun) dan Beranda agar nominal tak memamerkan diri di layar
 * mana pun.
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

/** Kunci localStorage untuk himpunan id akun yang disembunyikan. */
export const HIDE_ACCOUNTS_KEY = "yuto-hide-accounts";

function readHiddenIds(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(HIDE_ACCOUNTS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/**
 * Sembunyi per akun (independen dari toggle global): kembalikan apakah
 * akun disembunyikan + toggle per id. Efektif sembunyi =
 * `globalHidden || isHidden(id)` (diputus di call-site).
 */
export function useHiddenAccounts(): {
  isHidden: (id: string) => boolean;
  toggle: (id: string) => void;
} {
  const [ids, setIds] = useState<ReadonlySet<string>>(readHiddenIds);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === HIDE_ACCOUNTS_KEY) setIds(readHiddenIds());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(HIDE_ACCOUNTS_KEY, JSON.stringify([...next]));
      } catch {
        // Penyimpanan privat: preferensi sesi ini tetap jalan.
      }
      return next;
    });
  }, []);

  const isHidden = useCallback((id: string) => ids.has(id), [ids]);
  return { isHidden, toggle };
}
