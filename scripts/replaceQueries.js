// scripts/replaceQueries.js
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');

// Leer el archivo
let content = fs.readFileSync(serverPath, 'utf8');

// Hacer las sustituciones
content = content.replace(/await pool\.query\(/g, 'await executeQuery(');
content = content.replace(/pool\.query\(/g, 'executeQuery(');

// Escribir el archivo actualizado
fs.writeFileSync(serverPath, content);

console.log('✅ Todas las consultas pool.query han sido reemplazadas por executeQuery');
console.log('🔄 Revisa el archivo server.js para confirmar los cambios');