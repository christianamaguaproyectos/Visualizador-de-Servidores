#!/usr/bin/env node

/**
 * Script de Gestión de Usuarios
 * Herramienta CLI para administrar usuarios del sistema
 * 
 * Uso:
 *   node scripts/manage-users.js add --username admin --password Admin2025! --role admin --name "Administrador"
 *   node scripts/manage-users.js remove --username usuario1
 *   node scripts/manage-users.js list
 *   node scripts/manage-users.js change-password --username admin --password NuevaContraseña123!
 *   node scripts/manage-users.js init
 */

import authService from '../backend/src/services/authService.js';
import { Logger } from '../backend/src/utils/logger.js';

// Argumentos de línea de comandos
const args = process.argv.slice(2);
const command = args[0];

/**
 * Obtiene el valor de un argumento
 * @param {string} argName - Nombre del argumento (ej: '--username')
 * @returns {string|null} Valor del argumento
 */
function getArg(argName) {
  const index = args.indexOf(argName);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return null;
}

/**
 * Agrega un nuevo usuario
 */
async function addUser() {
  const username = getArg('--username');
  const password = getArg('--password');
  const role = getArg('--role') || 'viewer';
  const name = getArg('--name') || username;

  if (!username || !password) {
    console.error('❌ Error: --username y --password son requeridos');
    console.log('\nUso:');
    console.log('  node scripts/manage-users.js add --username USUARIO --password CONTRASEÑA [--role admin|viewer] [--name "Nombre Completo"]');
    process.exit(1);
  }

  if (role !== 'admin' && role !== 'viewer') {
    console.error('❌ Error: --role debe ser "admin" o "viewer"');
    process.exit(1);
  }

  const success = await authService.addUser(username, password, role, name);
  
  if (success) {
    console.log('\n✅ Usuario creado exitosamente:');
    console.log(`   Username: ${username}`);
    console.log(`   Nombre: ${name}`);
    console.log(`   Rol: ${role}`);
    console.log(`   Contraseña: ******** (hasheada con bcrypt)`);
  } else {
    console.error('\n❌ No se pudo crear el usuario');
    process.exit(1);
  }
}

/**
 * Elimina un usuario
 */
function removeUser() {
  const username = getArg('--username');

  if (!username) {
    console.error('❌ Error: --username es requerido');
    console.log('\nUso:');
    console.log('  node scripts/manage-users.js remove --username USUARIO');
    process.exit(1);
  }

  const success = authService.removeUser(username);
  
  if (success) {
    console.log(`\n✅ Usuario '${username}' eliminado exitosamente`);
  } else {
    console.error(`\n❌ Usuario '${username}' no encontrado`);
    process.exit(1);
  }
}

/**
 * Lista todos los usuarios
 */
function listUsers() {
  const users = authService.getAllUsers();

  if (users.length === 0) {
    console.log('\n📋 No hay usuarios registrados');
    console.log('   Usa el comando "init" para crear usuarios iniciales');
    return;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 USUARIOS REGISTRADOS');
  console.log('═══════════════════════════════════════════════════════\n');

  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.username}`);
    console.log(`   Nombre: ${user.name}`);
    console.log(`   Rol: ${user.role}`);
    console.log('');
  });

  console.log(`Total: ${users.length} usuario(s)`);
  console.log('═══════════════════════════════════════════════════════');
}

/**
 * Cambia la contraseña de un usuario
 */
async function changePassword() {
  const username = getArg('--username');
  const password = getArg('--password');

  if (!username || !password) {
    console.error('❌ Error: --username y --password son requeridos');
    console.log('\nUso:');
    console.log('  node scripts/manage-users.js change-password --username USUARIO --password NUEVA_CONTRASEÑA');
    process.exit(1);
  }

  const success = await authService.changePassword(username, password);
  
  if (success) {
    console.log(`\n✅ Contraseña de '${username}' actualizada exitosamente`);
  } else {
    console.error(`\n❌ No se pudo actualizar la contraseña de '${username}'`);
    process.exit(1);
  }
}

/**
 * Inicializa usuarios por defecto
 */
async function initUsers() {
  console.log('\n🔧 Inicializando usuarios por defecto...\n');

  // Usuario admin
  const adminExists = authService.getAllUsers().find(u => u.username === 'admin');
  if (!adminExists) {
    await authService.addUser('admin', 'Admin2025!', 'admin', 'Administrador');
    console.log('✅ Usuario admin creado');
    console.log('   Username: admin');
    console.log('   Password: Admin2025!');
    console.log('   Rol: admin\n');
  } else {
    console.log('ℹ️  Usuario "admin" ya existe\n');
  }

  // Usuario viewer
  const viewerExists = authService.getAllUsers().find(u => u.username === 'viewer');
  if (!viewerExists) {
    await authService.addUser('viewer', 'Viewer2025!', 'viewer', 'Usuario Lectura');
    console.log('✅ Usuario viewer creado');
    console.log('   Username: viewer');
    console.log('   Password: Viewer2025!');
    console.log('   Rol: viewer\n');
  } else {
    console.log('ℹ️  Usuario "viewer" ya existe\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ Inicialización completada');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('⚠️  IMPORTANTE: Cambia las contraseñas por defecto usando:');
  console.log('   node scripts/manage-users.js change-password --username admin --password TU_NUEVA_CONTRASEÑA\n');
}

/**
 * Muestra ayuda
 */
function showHelp() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📚 AYUDA - Gestión de Usuarios');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Comandos disponibles:\n');
  console.log('  init');
  console.log('    Crea usuarios por defecto (admin y viewer)');
  console.log('    Ejemplo: node scripts/manage-users.js init\n');
  console.log('  add');
  console.log('    Agrega un nuevo usuario');
  console.log('    Ejemplo: node scripts/manage-users.js add --username carlos --password Carlos123! --role admin --name "Carlos Pérez"\n');
  console.log('  remove');
  console.log('    Elimina un usuario existente');
  console.log('    Ejemplo: node scripts/manage-users.js remove --username carlos\n');
  console.log('  list');
  console.log('    Lista todos los usuarios registrados');
  console.log('    Ejemplo: node scripts/manage-users.js list\n');
  console.log('  change-password');
  console.log('    Cambia la contraseña de un usuario');
  console.log('    Ejemplo: node scripts/manage-users.js change-password --username admin --password NuevaContraseña123!\n');
  console.log('  help');
  console.log('    Muestra esta ayuda');
  console.log('    Ejemplo: node scripts/manage-users.js help\n');
  console.log('Roles disponibles:');
  console.log('  admin  - Puede ver y modificar (subir Excel, configurar)');
  console.log('  viewer - Solo puede visualizar datos\n');
  console.log('═══════════════════════════════════════════════════════');
}

/**
 * Punto de entrada
 */
async function main() {
  console.clear();
  
  switch (command) {
    case 'add':
      await addUser();
      break;
    case 'remove':
      removeUser();
      break;
    case 'list':
      listUsers();
      break;
    case 'change-password':
      await changePassword();
      break;
    case 'init':
      await initUsers();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.error('\n❌ Comando no reconocido:', command || '(ninguno)');
      showHelp();
      process.exit(1);
  }
}

// Ejecutar
main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
