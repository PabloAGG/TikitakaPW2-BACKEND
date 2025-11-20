const http = require('http');

// Función helper para hacer peticiones HTTP
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: `/api${path}`,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => reject(new Error('Timeout')));
        req.end();
    });
}

// Función para hacer pruebas de endpoints
async function testEndpoints() {
    console.log('🧪 Iniciando pruebas de endpoints...\n');

    try {
        // Test 1: Obtener todas las selecciones
        console.log('📝 Test 1: GET /api/selecciones');
        const selecciones = await makeRequest('/selecciones');
        console.log(`✅ Selecciones obtenidas: ${selecciones.length} registros\n`);

        // Test 2: Obtener todos los productos
        console.log('📝 Test 2: GET /api/productos');
        const productos = await makeRequest('/productos');
        console.log(`✅ Productos obtenidos: ${productos.length} registros\n`);

        // Test 3: Buscar productos
        console.log('📝 Test 3: GET /api/busqueda?q=perfume');
        const busqueda = await makeRequest('/busqueda?q=perfume');
        console.log(`✅ Búsqueda completada: ${busqueda.length} resultados\n`);

        // Test 4: Obtener un producto específico (si existe)
        if (productos.length > 0) {
            const productoId = productos[0].idProduct;
            console.log(`📝 Test 4: GET /api/producto/${productoId}`);
            const producto = await makeRequest(`/producto/${productoId}`);
            console.log(`✅ Producto obtenido: ${producto.nombre}\n`);

            // Test 5: Obtener estrellas del producto
            console.log(`📝 Test 5: GET /api/productos/${productoId}/estrellas`);
            const estrellas = await makeRequest(`/productos/${productoId}/estrellas`);
            console.log(`✅ Estrellas obtenidas: Promedio ${estrellas.promedio}, Total: ${estrellas.total}\n`);

            // Test 6: Obtener comentarios del producto
            console.log(`📝 Test 6: GET /api/productos/${productoId}/comentarios`);
            const comentarios = await makeRequest(`/productos/${productoId}/comentarios`);
            console.log(`✅ Comentarios obtenidos: ${comentarios.length} comentarios\n`);

            // Test 7: Obtener multimedia del producto
            console.log(`📝 Test 7: GET /api/multimedia/${productoId}`);
            const multimedia = await makeRequest(`/multimedia/${productoId}`);
            console.log(`✅ Multimedia obtenida: ${multimedia.length} archivos\n`);
        }

        console.log('🎉 ¡Todas las pruebas básicas pasaron exitosamente!');

    } catch (error) {
        console.error('❌ Error en las pruebas:', error.message);
    }
}

// Ejecutar las pruebas
testEndpoints();