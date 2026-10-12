# Design Brief: Yuto

Brand: **Yuto**, Javanese for "million". Tone: quiet, personal, trustworthy; it is the user's own server, so avoid cloud or marketing language. Wordmark "Yuto"; no mascot.

## 1. Design system

- **shadcn/ui**, style **Vega**, primitives from **Base UI** (`--base base`), icons from **Tabler** (`@tabler/icons-react`), **Tailwind CSS v4**. Theme comes from the shadcnstudio registry.
- Setup, run inside `apps/web` after Vite, Tailwind v4, and the `@/` alias (`tsconfig.json` paths + `vite.config.ts` alias) exist:

```bash
bunx --bun shadcn@latest init "https://shadcnstudio.com/r/components.json?style=vega&iconLibrary=tabler&menuColor=default&menuAccent=subtle" --base base
```

- The command writes `components.json` and the theme CSS (`src/index.css`). Commit both unchanged, then apply the two fixes in sections 3 and 4.
- Add components only when a screen needs them: `bunx --bun shadcn@latest add <name>`.

## 2. Theme tokens (from the generated CSS)

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | `oklch(0.48 0.20 260.48)` blue | `oklch(0.56 0.24 260.95)` |
| `--background` | `oklch(0.9555 0.0125 271.28)` | `oklch(0.26 0.03 262.71)` |
| `--card` | `oklch(0.9793 0.0083 271.33)` | `oklch(0.3452 0.0243 255.69)` |
| `--foreground` | `oklch(0.21 0.03 264.67)` | `oklch(0.93 0.01 264.60)` |
| `--muted-foreground` | `oklch(0.55 0.02 264.37)` | `oklch(0.71 0.02 261.33)` |
| `--destructive` | `oklch(0.58 0.22 27.33)` | `oklch(0.64 0.21 25.33)` |
| `--border` / `--input` | `oklch(0.8893 0.0169 259.42)` / `oklch(0.9002 0.013 266.69)` | `oklch(0.35 0.04 262.16)` |
| `--chart-1..5` | five blues | five blues |

- Radius scale derives from `--radius` (`sm` 0.6x ... `4xl` 2.6x). Shadows: `--shadow-2xs` to `--shadow-2xl`.
- Fonts: headings **Inter**, body **Source Serif 4**, code **IBM Plex Mono**.
- Dark mode: `.dark` class on `<html>`.
- **Rule:** use semantic classes (`bg-background`, `bg-card`, `text-muted-foreground`, `bg-primary`, `text-destructive`, `border-border`). No hex colors, no raw `oklch()` in components.
- The sidebar tokens exist but are unused: Yuto uses a bottom tab bar, not the shadcn Sidebar.

## 3. Fonts (self-host rule)

The generated CSS expects `--font-inter`, `--font-source-serif-4`, `--font-ibm-plex-mono` to be provided by Next.js `next/font`. Vite does not provide them, and Google Fonts would break the "no outbound calls" promise.

- Install Fontsource packages (bundled into the app): `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4`, `@fontsource/ibm-plex-mono`.
- Import them in `main.tsx` and define the three variables in `:root` with the installed family names plus a system fallback (e.g. `--font-inter: "Inter Variable", system-ui, sans-serif;`). Check the exact family names in each package's README.
- Check in the browser that headings, body, and mono really render in these fonts.

## 4. Radius fix

The CSS uses `var(--radius)` but does not define it. If cards and inputs render with square corners, add `--radius: 0.625rem;` to `:root` (shadcn default; our choice, not from the registry).

## 5. Money colors

- Expense: `text-destructive`, sign `-`.
- Income: `text-emerald-700 dark:text-emerald-400`, sign `+` (emerald-700 is about 5.5:1 on white; emerald-600 would fail AA).
- Never color alone: the sign is always shown. *Shortcut: Tailwind emerald for income; add an `--income` token if more places need it.*
- Amounts use `tabular-nums` so digits align. Check it renders with Source Serif 4.

## 6. Layout

Mobile first, 360-430 px. On wider screens the app is centered in a 480 px column. Bottom tab bar: Home, Wallet, **Record** (center), Activity, Reports. Light/dark follows the system setting; no manual toggle in MVP. *Shortcut: system-only, add a toggle when asked.*

## 7. Components

**From shadcn:** Button, Card, Input, Label, Select, Tabs (Bank / E-wallet / Cash, kind filter), Switch, Calendar (Activity), Badge, Skeleton, AlertDialog (confirm delete / discard), Sonner (toasts), Chart.
**Custom:** BalanceCard, TransactionRow (icon, title, account, time, signed amount), DayGroupHeader (daily total), AmountInput (numeric keypad, live `250.000`, quick chips +10k/+20k/+50k/+100k), AccountPicker with `Rp A -> Rp B` preview, MonthPicker, BottomTabs, EmptyState.

## 8. Behavior

- Amount input stores an integer; display only is formatted.
- Hide balance shows `Rp ••••`; the preference is remembered on the device.
- Destructive actions use AlertDialog.
- Reports: `--chart-1..5` are all blues and hard to tell apart. Show each category as a labelled row with its percent, and use the chart only as a supplement.

## 9. Language

UI text is Indonesian, in one file `apps/web/src/strings.ts`. No i18n library in MVP. *Shortcut: single language; add a library if a second is needed.*

## 10. Accessibility

Contrast AA in both themes (check `destructive` and `primary-foreground` on their backgrounds); targets 44 px+; every input labelled; focus visible (`ring` token); amounts announced with sign ("minus 250 thousand rupiah").