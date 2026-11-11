/**
 * Obtiene la URL de conexion a PostgreSQL desde las variables de entorno (.env).
 *
 * Nunca usa contraseñas por defecto escritas en el codigo: si la variable
 * no existe, el script se detiene con un mensaje claro.
 */
import 'dotenv/config';

export function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!url) {
    console.error('❌ Falta la variable DATABASE_URL (o POSTGRES_URL) en el archivo .env');
    console.error('   Ejemplo: DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/base_de_datos');
    process.exit(1);
  }

  return url;
}
