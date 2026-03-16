-- =============================================
-- SCHEMA: Sistema de Usuarios
-- =============================================

-- Crear schema si no existe
CREATE SCHEMA IF NOT EXISTS users;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users.users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'viewer')),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_username ON users.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users.users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users.users(active);

-- Comentarios
COMMENT ON TABLE users.users IS 'Usuarios del sistema con autenticación';
COMMENT ON COLUMN users.users.username IS 'Nombre de usuario único';
COMMENT ON COLUMN users.users.password_hash IS 'Hash bcrypt de la contraseña';
COMMENT ON COLUMN users.users.role IS 'Rol del usuario: admin (lectura/escritura) o viewer (solo lectura)';
COMMENT ON COLUMN users.users.name IS 'Nombre completo del usuario';
COMMENT ON COLUMN users.users.active IS 'Indica si el usuario está activo';
COMMENT ON COLUMN users.users.last_login IS 'Última fecha de login';
