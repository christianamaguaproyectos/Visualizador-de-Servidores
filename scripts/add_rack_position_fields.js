import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgres://mon_user:Danec_mo_2025*_*@localhost:5432/monitoring'
});

async function addRackPositionFields() {
  try {
    await client.connect();
    console.log('✅ Conectado a PostgreSQL');

    // Verificar si las columnas ya existen
    const checkColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'inventory' 
        AND table_name = 'servers' 
        AND column_name IN ('rack_position', 'rack_units')
    `);
    
    if (checkColumns.rows.length === 2) {
      console.log('✅ Las columnas ya existen');
      return;
    }

    // Intentar agregar columnas (si falla por permisos, mostrar instrucciones)
    try {
      await client.query(`
        ALTER TABLE inventory.servers 
          ADD COLUMN IF NOT EXISTS rack_position INTEGER DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS rack_units INTEGER DEFAULT 2
      `);
      console.log('✅ Columnas rack_position y rack_units agregadas');
    } catch (error) {
      if (error.message.includes('debe ser dueño')) {
        console.log('\n⚠️  El usuario no tiene permisos para modificar la tabla.');
        console.log('\n📋 Ejecuta estos comandos manualmente en PostgreSQL:\n');
        console.log('ALTER TABLE inventory.servers ADD COLUMN IF NOT EXISTS rack_position INTEGER DEFAULT NULL;');
        console.log('ALTER TABLE inventory.servers ADD COLUMN IF NOT EXISTS rack_units INTEGER DEFAULT 2;');
        console.log('UPDATE inventory.servers SET rack_units = 2 WHERE rack_units IS NULL;\n');
        return;
      }
      throw error;
    }

    // Actualizar valores existentes
    const result = await client.query(`
      UPDATE inventory.servers 
      SET rack_units = 2 
      WHERE rack_units IS NULL
    `);
    console.log(`✅ ${result.rowCount} servidores actualizados con rack_units = 2`);

    console.log('\n✅ Migración completada exitosamente');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addRackPositionFields();
