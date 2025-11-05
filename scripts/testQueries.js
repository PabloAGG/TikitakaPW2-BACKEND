// scripts/testQueries.js
require('dotenv').config();
const { executeQuery, getDatabaseInfo } = require('../config/database');

async function testProductsQuery() {
    console.log('🧪 Probando consulta de productos...');
    
    const dbInfo = getDatabaseInfo();
    console.log(`📊 Base de datos actual: ${dbInfo.type} (${dbInfo.environment})`);
    
    try {
        const query = `
            SELECT DISTINCT ON (p."idProduct")
                   p.*,
                   s."Nombre" AS seleccionNombre,
                   m.url AS img
            FROM producto AS p
            LEFT JOIN selecciones AS s ON p.seleccion = s."idSelec"
            LEFT JOIN multimedia AS m ON p."idProduct" = m.producto
            WHERE p.activo = true
            ORDER BY p."idProduct" DESC, m.idmulti ASC
        `;
        
        const result = await executeQuery(query);
        console.log('✅ Consulta ejecutada exitosamente');
        console.log(`📋 Productos encontrados: ${result.rows.length}`);
        
        if (result.rows.length > 0) {
            console.log('🎯 Primer producto:');
            console.log(`   - ID: ${result.rows[0].idProduct}`);
            console.log(`   - Nombre: ${result.rows[0].nombre}`);
            console.log(`   - Selección: ${result.rows[0].seleccionNombre}`);
            console.log(`   - Imagen: ${result.rows[0].img ? 'Sí' : 'No'}`);
        }
        
    } catch (error) {
        console.error('❌ Error en la consulta:', error.message);
    }
}

async function testSimpleQuery() {
    console.log('\n🧪 Probando consulta simple...');
    
    try {
        const query = 'SELECT COUNT(*) as total FROM selecciones';
        const result = await executeQuery(query);
        console.log('✅ Consulta simple exitosa');
        console.log(`📊 Total de selecciones: ${result.rows[0].total || result.rows[0]['COUNT(*)']}`);
    } catch (error) {
        console.error('❌ Error en consulta simple:', error.message);
    }
}

async function main() {
    console.log('🔍 Probando adaptación de consultas SQL\n');
    
    await testSimpleQuery();
    await testProductsQuery();
    
    console.log('\n✅ Pruebas completadas');
}

if (require.main === module) {
    main();
}