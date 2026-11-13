-- =============================================
-- Sesiones de usuario persistidas en PostgreSQL (connect-pg-simple)
-- Antes vivían en memoria: cada reinicio cerraba la sesión de todos.
-- =============================================

CREATE SCHEMA IF NOT EXISTS users;

CREATE TABLE IF NOT EXISTS users.sessions (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire ON users.sessions (expire);

COMMENT ON TABLE users.sessions IS 'Sesiones de express-session (connect-pg-simple)';
