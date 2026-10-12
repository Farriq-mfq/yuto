# Code style
- TypeScript strict. No `any`; use `unknown` and narrow.
- Named exports, except React pages (default export for routing).
- File names: `kebab-case.ts`; React components `PascalCase.tsx`.
- Functions small, one job. Early return over nesting.
- No dead code, no commented-out code. Comment only the *why*.
- A deliberate shortcut gets one line: `// shortcut: <limit>, <when to upgrade>`.
- No new dependency for a few lines of code. Check `package.json` first.
