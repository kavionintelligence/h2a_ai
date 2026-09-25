# Deployment

## Local SQLite

Follow README installation and environment initialization. Run `python scripts/migrate.py` then the one-worker uvicorn factory. The service also bootstraps schema v1 automatically. Database path is relative to the working directory. Back up `census.db` through SQLite's backup interface or while the service is stopped; do not copy only the database file during WAL writes.

`CENSUS_MONITOR_INTERVAL_SECONDS=30` starts the in-process monitor; `0` disables it. Each sweep polls approved HTTP endpoints at `<endpoint>/health`, refreshes graph/alerts, and expires stale behavioral evidence. An HTTP 2xx probe establishes endpoint reachability, not skill accuracy. New cards/inventories must be resubmitted by your authorized collector; periodic network enumeration is not configured automatically.

## Docker

Initialize `.env`, then run `docker compose up --build api`. The default service publishes loopback port 8000, stores SQLite in `census-data`, uses a non-root user, drops capabilities, disables privilege escalation and has a read-only root filesystem plus writable data/tmp mounts. Docker installation and engine availability are prerequisites. Container execution was not available in the delivery environment; see validation results. Base OS image tags are not digest-locked, so their updates require revalidation.

## PostgreSQL

The supplied optional profile requires Docker Compose 2.24.4+ for `!override`:

```bash
docker compose --profile postgres up --build postgres api-postgres
```

This starts PostgreSQL on the private Compose network and the API on host loopback **8001**. It uses the generated `POSTGRES_PASSWORD` from `.env` and the psycopg extra included in the lock. PostgreSQL is not exposed to the host. The same bootstrap schema applies. To use an existing database, set `CENSUS_DATABASE_URL=postgresql+psycopg://...` in your private runtime environment and run the migration entry point. Do not log this URL or commit it.

The PostgreSQL SQL dialect is supported by the SQLAlchemy schema, but a live PostgreSQL server was **NOT EVALUATED** in this environment. SQLite is the demonstrated path. Multi-worker and distributed operation are unsupported regardless of database.

## Production handoff

Before deployment beyond the controlled prototype: supply TLS ingress, OIDC principals and tenant/service scopes, network egress enforcement, quotas and rate limits, encrypted backups, workload identity verification, monitored ingestion exporters, schema upgrade/rollback procedures, and a durable scheduler. Exercise your real targets' protocol/version/auth behavior in staging. Current protocol restrictions are enumerated in `protocols.md`; unknown support must not be advertised as successful interoperability.
