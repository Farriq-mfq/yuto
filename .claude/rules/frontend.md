---
paths:
  - "apps/web/**"
---

# Frontend rules (React)

- Server data goes through TanStack Query + Eden Treaty. No hand-written fetch types, no duplicated API types.
- Local state only for UI state (form fields, open/closed). Never copy server data into state.
- All user-visible text lives in `src/strings.ts` (Indonesian).
- Format money with one helper `formatRupiah(n)` using `Intl.NumberFormat("id-ID", ...)`. Amounts are integers everywhere in code.
- Every screen handles loading, empty, error (with retry).
- Accessibility: labelled inputs, 44 px touch targets, AA contrast, income/expense never color-only (sign too).
- UI is shadcn/ui (Vega, Base UI, Tabler icons) on Tailwind v4. Follow `docs/DESIGN_BRIEF.md`.
- Add components with `bunx --bun shadcn@latest add <name>` into `src/components/ui`; do not hand-copy or restyle them ad hoc.
- Colors only through semantic tokens (`bg-card`, `text-destructive`, ...). No hex, no raw `oklch()`. Income/expense colors follow DESIGN_BRIEF section 5.
- Icons from `@tabler/icons-react` only.
- Fonts are bundled with Fontsource. Never load fonts, scripts, or styles from a CDN (self-host promise).
- No extra CSS files unless unavoidable.
