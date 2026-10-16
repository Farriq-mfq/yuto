import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Bar judul halaman yang menempel di atas saat konten di-scroll
 * (`position: sticky`). Latar blur agar teks di bawahnya tak menembus.
 * Lebar dibuat full-bleed mengikuti padding container halaman standar
 * (`px-4` / `sm:px-5`) via margin negatif.
 */
export function PageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-5 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
