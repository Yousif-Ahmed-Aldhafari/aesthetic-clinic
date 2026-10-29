#!/bin/sh
set -eu
test -n "${APP_DATABASE_PASSWORD:-}" || { echo 'APP_DATABASE_PASSWORD is required' >&2; exit 1; }
test -n "${MIGRATION_DATABASE_PASSWORD:-}" || { echo 'MIGRATION_DATABASE_PASSWORD is required' >&2; exit 1; }
psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set app_password="$APP_DATABASE_PASSWORD" --set migration_password="$MIGRATION_DATABASE_PASSWORD" <<'SQL'
CREATE ROLE lamssa_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'migration_password';
CREATE ROLE lamssa_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'app_password';
SQL
createdb --username "$POSTGRES_USER" --owner lamssa_migrator lamssa
