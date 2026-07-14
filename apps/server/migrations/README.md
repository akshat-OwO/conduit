# Database migrations

Add migrations here using the filename format `<id>_<name>.ts`, for example `1_create_users.ts`. Each migration must default-export an Effect that uses the `SqlClient` service.

Migrations run in ascending ID order before the HTTP server starts. Completed migrations are recorded in the `effect_sql_migrations` table and are not run again.
