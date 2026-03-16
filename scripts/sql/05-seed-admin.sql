-- Crear usuario admin por defecto
-- Contraseña: admin123
INSERT INTO users.users (username, password_hash, role, name, email) 
VALUES ('admin', '$2b$10$OwQXqRhQdfrqM2hJJlvMGOmYAxb7aF0t9UxafpNGMSRBO7vWerm.2', 'admin', 'Administrador', 'admin@example.com')
ON CONFLICT (username) DO NOTHING;
