// scripts/initMySQL.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initializeMySQL() {
    try {
        console.log('🔧 Iniciando configuración de MySQL...');
        
        // Configuración de conexión
        const config = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            port: process.env.MYSQL_PORT || 3306,
            multipleStatements: true
        };

        console.log(`📡 Conectando a MySQL en ${config.host}:${config.port}...`);
        
        // Crear conexión
        const connection = await mysql.createConnection(config);
        
        // Leer el script SQL
        const sqlScript = fs.readFileSync(path.join(__dirname, 'mysql_init.sql'), 'utf8');
        
        console.log('📝 Ejecutando script de inicialización...');
        
        // Ejecutar el script
        const [results] = await connection.execute(sqlScript);
        
        console.log('✅ Script ejecutado exitosamente');
        
        // Verificar que las tablas se crearon
        const [tables] = await connection.execute('SHOW TABLES FROM tikitaka_test');
        
        console.log('📋 Tablas creadas:');
        tables.forEach(table => {
            console.log(`  - ${Object.values(table)[0]}`);
        });
        
        await connection.end();
        console.log('🎉 ¡MySQL inicializado exitosamente para TikiTaka!');
        console.log('💡 Para usar MySQL, cambia USE_TEST_DB=true en tu archivo .env');
        
    } catch (error) {
        console.error('❌ Error al inicializar MySQL:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Asegúrate de que MySQL esté ejecutándose en tu sistema');
            console.log('💡 Verifica las credenciales en el archivo .env');
        }
        
        process.exit(1);
    }
}

// Verificar si se está ejecutando directamente
if (require.main === module) {
    initializeMySQL();
}

module.exports = { initializeMySQL };