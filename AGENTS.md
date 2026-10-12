# Agents: Yuto

Defined in `.claude/agents/` (Claude Code) and registered in `opencode.json` (OpenCode, which reads the same prompt files). Invoke by name with `@coding`, `@testing`, etc.

OpenCode loads `CLAUDE.md` and `.claude/rules/*.md` through `opencode.json` `instructions`, because it ignores `CLAUDE.md` when an `AGENTS.md` exists.

| Agent | Use it for | Writes code? |
|-------|-----------|--------------|
| `coding` | Implement a feature or fix in API or web | Yes |
| `testing` | Write and run tests, find missing cases | Tests only |
| `reviewer` | Review a diff for bugs, security, scope | No |
| `database` | Schema changes, migrations, queries, indexes | Schema + migrations |
| `devops` | Docker, compose, env, CI | Infra files only |
| `docs` | Keep `docs/` and `CLAUDE.md` in sync with the code | Docs only |

Typical flow: `coding` -> `testing` -> `reviewer`. Schema change: `database` first.
