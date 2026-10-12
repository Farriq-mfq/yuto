---
name: monorepo-imports
description: How imports work between apps/api and apps/web in the Yuto Bun workspace. Use when the web needs the API types, when you see "Cannot find module", when adding shared code, or when setting up path aliases.
---

# Monorepo imports (Bun workspaces)

```
apps/api   package name @yuto/api   (Bun + Elysia + Drizzle)
apps/web   package name @yuto/web   (React + Vite)
```

## The one allowed cross-app import

The web gets a typed API client (Eden Treaty) from the API's **type only**:

```ts
// apps/web/src/lib/api.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "@yuto/api";

export const api = treaty<App>(window.location.origin);
```

Setup:

- `apps/web/package.json` -> `"devDependencies": { "@yuto/api": "workspace:*" }`, then `bun install` at the repo root.
- `apps/api/package.json` -> `"name": "@yuto/api"` and `"exports": { ".": { "types": "./src/app.ts" } }`.
- `apps/api/src/app.ts` builds the Elysia app and does `export type App = typeof app`. It must **not** call `.listen()`; that stays in `index.ts`.

## Rules

1. **Type-only.** Web code may use `import type ... from "@yuto/api"`. Never import runtime values from the API: it would pull Drizzle, the database client, and secrets into the browser bundle. Set `"verbatimModuleSyntax": true` in the web `tsconfig.json` so a non-type import is an error.
2. **No relative imports across apps.** Never `../../api/src/...` or `../../web/src/...`.
3. **Aliases inside an app only.** `@/` maps to that app's `src/`. Set it in the app's `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`) and, for web, in `vite.config.ts` (`resolve.alias`). Bun reads tsconfig paths for the API with no extra setup.
4. **No shared package yet.** *Shortcut: if both apps need the same constant or helper, copy the few lines. Create `packages/shared` only when two or more real pieces are shared.*
5. **Dependencies:** install from the repo root. Use `bun add <pkg> --cwd apps/web` (or `apps/api`) so it lands in the right `package.json`. One lockfile at the root, always committed.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find module '@yuto/api'` | Missing workspace link: add the devDependency above, run `bun install` at the root |
| Types are stale after an API change | Restart the TypeScript server in the editor; check `app.ts` exports `App` |
| Web build includes server code or fails on `bun:` / `pg` | A runtime import from `@yuto/api` slipped in; change it to `import type` |
| `Cannot find module '@/...'` in web | Alias missing in `vite.config.ts` or `tsconfig.json` |
| Docker build cannot resolve the workspace | Build with the repo root as context and `COPY` the whole repo before `bun install --frozen-lockfile` |

## Done when

Web type-checks against the API's types, the web production build contains no API code, and `bun install --frozen-lockfile` passes from a clean clone.
