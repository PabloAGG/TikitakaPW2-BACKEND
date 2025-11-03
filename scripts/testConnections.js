// scripts/testConnections.js
require('dotenv').config();
const { Pool } = require('pg');
const mysql = require('mysql2/promise');

async function testPostgreSQL() {
    console.log('🔍 Probando conexión a PostgreSQL (Supabase)...');
    try {
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as now, version() as version');
        client.release();
        
        console.log('✅ PostgreSQL conectado exitosamente');
        console.log(`   Hora del servidor: ${result.rows[0].now}`);
        console.log(`   Versión: ${result.rows[0].version.split(' ')[0]}`);
        
        await pool.end();
        return true;
    } catch (error) {
        console.log('❌ Error conectando a PostgreSQL:', error.message);
        return false;
    }
}

async function testMySQL() {
    console.log('🔍 Probando conexión a MySQL...');
    try {
        const config = {
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'tikitaka_test',
            port: process.env.MYSQL_PORT || 3306
        };

        const connection = await mysql.createConnection(config);
        const [rows] = await connection.execute('SELECT NOW() as now, VERSION() as version');
        
        console.log('✅ MySQL conectado exitosamente');
        console.log(`   Hora del servidor: ${rows[0].now}`);
        console.log(`   Versión: ${rows[0].version}`);
        
        // Verificar si las tablas existen
        const [tables] = await connection.execute('SHOW TABLES');
        if (tables.length > 0) {
            console.log(`   Tablas encontradas: ${tables.length}`);
        } else {
            console.log('⚠️  No se encontraron tablas. Ejecuta: npm run init-mysql');
        }
        
        await connection.end();
        return true;
    } catch (error) {
        console.log('❌ Error conectando a MySQL:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 MySQL no está ejecutándose o las credenciales son incorrectas');
        }
        return false;
    }
}

async function main() {
    console.log('🧪 Probando conexiones de base de datos para TikiTaka\n');
    
    const pgOk = await testPostgreSQL();
    console.log('');
    const mysqlOk = await testMySQL();
    
    console.log('\n📊 Resumen:');
    console.log(`   PostgreSQL (Supabase): ${pgOk ? '✅ OK' : '❌ FALLO'}`);
    console.log(`   MySQL (Pruebas): ${mysqlOk ? '✅ OK' : '❌ FALLO'}`);
    
    const currentDB = process.env.USE_TEST_DB === 'true' ? 'MySQL' : 'PostgreSQL';
    console.log(`\n🎯 Base de datos actual: ${currentDB}`);
    console.log('💡 Para cambiar, modifica USE_TEST_DB en .env');
}

if (require.main === module) {
    main();
}

module.exports = { testPostgreSQL, testMySQL };