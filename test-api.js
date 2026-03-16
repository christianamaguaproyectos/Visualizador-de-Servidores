// Script de prueba para verificar el endpoint /api/data
async function testAPI() {
  try {
    console.log('🔍 Probando endpoint /api/data...\n');
    
    const response = await fetch('http://localhost:3050/api/data?type=fisicos');
    const data = await response.json();
    
    console.log('✅ Respuesta completa:', JSON.stringify(data, null, 2).substring(0, 500));
    console.log('\n📊 Resumen:');
    console.log(`   - Status: ${response.status}`);
    console.log(`   - Tiene error: ${!!data.error}`);
    console.log(`   - Racks: ${data.racks ? data.racks.length : 'undefined'}`);
    console.log(`   - Servidores: ${data.servers ? data.servers.length : 'undefined'}`);
    
    if (data.error) {
      console.log(`\n❌ Error del servidor: ${data.error}`);
      console.log(`   Mensaje: ${data.message}`);
      return;
    }
    
    if (data.racks && data.racks.length > 0) {
      console.log('\n📦 Primeros 3 racks:');
      data.racks.slice(0, 3).forEach(rack => {
        console.log(`   - ${rack.name}: ${rack.servers.length} servidores`);
      });
    } else {
      console.log('\n⚠️  No se encontraron racks');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPI();
