// config/database.js
require('dotenv').config(); 
const { Pool } = require('pg');
const mysql = require('mysql2/promise');

// Variable para alternar entre bases de datos
const USE_TEST_DB = process.env.USE_TEST_DB === 'true';

console.log(`🗄️  Configuración de BD: ${USE_TEST_DB ? 'MySQL (Pruebas)' : 'Supabase (Producción)'}`);

let pool;

if (USE_TEST_DB) {
    // Configuración para MySQL (Base de datos de pruebas)
    const mysqlConfig = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'tikitaka_test',
        port: process.env.MYSQL_PORT || 3306,
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
        // Configuración adicional para compatibilidad
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true
    };

    pool = mysql.createPool(mysqlConfig);
    
    // Adaptar interfaz de mysql2 para que sea compatible con pg
    const originalQuery = pool.query.bind(pool);
    pool.query = async (text, params) => {
        try {
            const [rows] = await originalQuery(text, params);
            return { rows };
        } catch (error) {
            throw error;
        }
    };

    // Método connect para compatibilidad con pg
    pool.connect = (callback) => {
        pool.getConnection()
            .then(connection => {
                connection.query('SELECT NOW() as now')
                    .then(([rows]) => {
                        connection.release();
                        if (callback) {
                            const mockClient = {
                                query: (text, cb) => {
                                    if (cb) cb(null, { rows });
                                }
                            };
                            const mockRelease = () => {};
                            callback(null, mockClient, mockRelease);
                        }
                    })
                    .catch(error => {
                        connection.release();
                        if (callback) callback(error);
                    });
            })
            .catch(error => {
                if (callback) callback(error);
            });
    };

} else {
    // Configuración para PostgreSQL (Supabase - Producción)
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

// Función para obtener la configuración actual
const getDatabaseInfo = () => {
    return {
        type: USE_TEST_DB ? 'MySQL' : 'PostgreSQL',
        environment: USE_TEST_DB ? 'Pruebas' : 'Producción',
        isTestDB: USE_TEST_DB
    };
};

// Función para convertir consultas de PostgreSQL a MySQL cuando sea necesario
const adaptQuery = (query, params) => {
    if (!USE_TEST_DB) {
        // Si estamos usando PostgreSQL, devolver tal como está
        return { query, params };
    }

    // Convertir sintaxis de PostgreSQL a MySQL
    let adaptedQuery = query;
    
    // Convertir $1, $2, etc. a ? para MySQL
    let paramIndex = 1;
    adaptedQuery = adaptedQuery.replace(/\$\d+/g, () => {
        return '?';
    });

    // Convertir nombres de columnas con comillas dobles a backticks
    adaptedQuery = adaptedQuery.replace(/"([^"]+)"/g, '`$1`');

    // Convertir ILIKE a LIKE para MySQL (case insensitive por defecto)
    adaptedQuery = adaptedQuery.replace(/ILIKE/gi, 'LIKE');

    // Convertir DISTINCT ON - MySQL no lo soporta, usar GROUP BY en su lugar
    if (adaptedQuery.includes('DISTINCT ON')) {
        console.warn('⚠️  DISTINCT ON detectado - convirtiendo a sintaxis MySQL');
        
        // Extraer la columna del DISTINCT ON
        const distinctOnMatch = adaptedQuery.match(/DISTINCT ON\s*\(\s*([^)]+)\s*\)/i);
        if (distinctOnMatch) {
            const distinctColumn = distinctOnMatch[1];
            
            // Remover DISTINCT ON y agregar GROUP BY al final
            adaptedQuery = adaptedQuery.replace(/DISTINCT ON\s*\([^)]+\)/i, '');
            
            // Si no hay GROUP BY, agregarlo
            if (!adaptedQuery.includes('GROUP BY')) {
                // Buscar la posición del ORDER BY para insertar GROUP BY antes
                const orderByIndex = adaptedQuery.search(/ORDER BY/i);
                if (orderByIndex > -1) {
                    adaptedQuery = adaptedQuery.substring(0, orderByIndex) + 
                                  `GROUP BY ${distinctColumn} ` + 
                                  adaptedQuery.substring(orderByIndex);
                } else {
                    adaptedQuery += ` GROUP BY ${distinctColumn}`;
                }
            }
        }
    }

    // Convertir RETURNING * a un SELECT después del INSERT/UPDATE (MySQL no soporta RETURNING)
    if (adaptedQuery.includes('RETURNING')) {
        console.warn('⚠️  RETURNING clausula detectada - MySQL no la soporta nativamente');
        adaptedQuery = adaptedQuery.replace(/\s+RETURNING\s+\*/gi, '');
    }

    // Convertir boolean true/false a 1/0 para MySQL
    adaptedQuery = adaptedQuery.replace(/= true/gi, '= 1');
    adaptedQuery = adaptedQuery.replace(/= false/gi, '= 0');

    return { query: adaptedQuery, params };
};

// Función para manejar consultas específicas que requieren conversión completa
const handleSpecificQueries = (originalQuery, params) => {
    if (!USE_TEST_DB) {
        return { query: originalQuery, params };
    }

    // Detectar y convertir la consulta de productos con DISTINCT ON
    if (originalQuery.includes('DISTINCT ON') && originalQuery.includes('producto') && originalQuery.includes('multimedia')) {
        console.log('🔄 Convirtiendo consulta de productos con DISTINCT ON para MySQL');
        
        const mysqlQuery = `
            SELECT 
                p.*,
                s.\`Nombre\` AS seleccionNombre,
                (SELECT m.url FROM multimedia m WHERE m.producto = p.\`idProduct\` ORDER BY m.idmulti ASC LIMIT 1) AS img
            FROM producto AS p
            LEFT JOIN selecciones AS s ON p.seleccion = s.\`idSelec\`
            WHERE p.activo = 1
            ORDER BY p.\`idProduct\` DESC
        `;
        
        return { query: mysqlQuery, params };
    }

    // Para otras consultas, usar la adaptación normal
    return adaptQuery(originalQuery, params);
};

// Función wrapper para ejecutar consultas con adaptación automática
const executeQuery = async (originalQuery, params = []) => {
    const { query, params: adaptedParams } = handleSpecificQueries(originalQuery, params);
    
    try {
        const result = await pool.query(query, adaptedParams);
        return result;
    } catch (error) {
        console.error('❌ Error en consulta SQL:', error.message);
        console.error('🔍 Query:', query);
        console.error('📝 Params:', adaptedParams);
        throw error;
    }
};

module.exports = {
    pool,
    getDatabaseInfo,
    adaptQuery,
    executeQuery,
    USE_TEST_DB
};