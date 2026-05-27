# HubAssist Backend

NestJS REST API for the HubAssist platform.

## Database Migrations

TypeORM migrations are used instead of `synchronize: true`. The `synchronize` flag is only enabled in the `test` environment.

### Setup

Ensure `DATABASE_URL` is set in `backend/.env`.

### Commands

```bash
# Generate a new migration (diff entities vs current DB schema)
npm run migration:generate src/migrations/<MigrationName>

# Apply all pending migrations
npm run migration:run

# Revert the last applied migration
npm run migration:revert
```

### Workflow

1. Modify or add entity files under `src/`.
2. Run `migration:generate` — TypeORM diffs the entities against the live schema and writes a new migration file to `src/migrations/`.
3. Review the generated migration file before committing.
4. Run `migration:run` to apply it locally.
5. In production, migrations run automatically on startup (`migrationsRun: true`).

### Migration files

All migration files live in `src/migrations/`. They are compiled to `dist/migrations/` during `npm run build` and executed from there in production.
