---
name: docker-troubleshooting
description: Diagnose and fix problems running Yuto with Docker Compose (db, api, web). Use when a container exits, the app will not start, login fails, the web shows 502, or .env or code changes are not taking effect.
---

# Docker troubleshooting (Yuto)

Stack: `db` (postgres:16-alpine), `api` (Bun + Elysia, :3000), `web` (nginx, host port 8080, proxies `/api` to `api:3000`).

## First, look (read-only)

```bash
docker compose ps                    # who is up / unhealthy / exited
docker compose logs --tail=100 api   # the real error is almost always here
docker compose logs --tail=50 db
docker compose exec db pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
docker compose config                # shows the final merged config and env values
```

## Symptoms

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `api` exits right after start, log mentions secret or password | Startup check failed: `JWT_SECRET` under 32 chars, `YUTO_PASSWORD` under 12 chars, missing, or still the example value | Set real values in `.env`, then `docker compose up -d` |
| `api` cannot connect to the database | `DATABASE_URL` host is `localhost`. Inside compose the host is `db` | Use `@db:5432` in compose (the compose file sets it) |
| `db` unhealthy / `api` waits forever | Wrong `POSTGRES_*` values, or the db log shows an init error | Read `logs db`; fix `.env` |
| Password rejected after you changed `POSTGRES_PASSWORD` | Postgres only reads that variable on the **first** init of the volume | Change it in the database: `docker compose exec db psql -U $POSTGRES_USER -c "ALTER USER $POSTGRES_USER PASSWORD '...'"`, then update `.env` |
| Migration fails on start | SQL error or schema drift | Read `logs api`; fix with a new migration (see `database-migration`) |
| Web shows 502 on `/api/...` | `api` is down or crashed | `ps`, then `logs api` |
| Login seems to work but every next request is 401 | `COOKIE_SECURE=true` over plain HTTP, so the browser drops the cookie | Use HTTPS via a reverse proxy. Only on a trusted LAN: `COOKIE_SECURE=false` |
| `port is already allocated` | Host port 8080 (or 3000, 5432) in use | Change the host port in compose, or stop the other process |
| Code change not visible | Image not rebuilt | `docker compose up -d --build` |
| `.env` change not visible | Container not recreated | `docker compose up -d` (it recreates changed services) |

## Never

- `docker compose down -v` or `docker volume rm` without a fresh backup. That deletes all financial data.
- Publish the `db` port to the internet.
- Paste `.env` contents into logs, issues, or chat.

## Clean rebuild without losing data

```bash
docker compose down            # no -v: keeps the pgdata volume
docker compose up -d --build
```

## Done when

`docker compose ps` shows all three services up and `db` healthy, `curl -i localhost:8080/api/health` returns 200, and you can log in.
