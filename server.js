// server.js
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
 const jwt = require('jsonwebtoken');
const saltRounds = 10;

const app = express();
const port = process.env.PORT || 3001;

// Configuración de CORS para aceptar solo el FRONTEND_URL
const corsOptions = {
    origin: process.env.FRONTEND_URL,
    credentials: true
};

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
pool.connect((err, client, release) => {
  if (err) {
    return console.error('¡ERROR FATAL AL CONECTAR CON LA BASE DE DATOS!', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // Es importante liberar el cliente después de usarlo
    if (err) {
      return console.error('Error ejecutando la consulta de prueba', err.stack);
    }
    console.log('¡Conexión a la base de datos verificada exitosamente! Hora de la DB:', result.rows[0].now);
  });
});
app.use(cors(corsOptions));

app.use(express.json());

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader){ 
        
        return res.status(403).json({ error: 'Token requerido' })
    };
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'Token malformado' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Token no válido o expirado' });
        req.user = decoded;
        next();
    });
};

const esAdmin = (req, res, next) => {
    if (req.user && req.user.admin) {
        next();
    } else {
        res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
};
// 4. Rutas (los "endpoints" de nuestra API)
app.get('/', (req, res) => {
    res.send('¡API del Catálogo funcionando!');
});
app.get('/api/busqueda', async (req, res) => {
    const { q } = req.query; // Obtenemos el parámetro de búsqueda
    try {
        console.log(`Petición recibida para buscar productos con el término: ${q}`);
        const query = `
            SELECT p.*, s."Nombre" AS seleccionNombre 
            FROM producto AS p
            LEFT JOIN selecciones AS s ON p.seleccion = s."idSelec"
            WHERE p.activo = true AND (p.nombre ILIKE $1 OR s."Nombre" ILIKE $1)
            ORDER BY p."idProduct" DESC
        `;
        const { rows } = await pool.query(query, [`%${q}%`]);
        res.json(rows);
    } catch (error) {
        console.error('Error al buscar productos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// api registro y login
app.post('/api/auth/register', async (req, res) => {

    const { nombre, apellidos,telefono,contraseña,correo,seleccion} = req.body;
    const hashedPassword = await bcrypt.hash(contraseña, saltRounds);
    try {
        console.log("Petición recibida para registrar un nuevo usuario");
        const { rows } = await pool.query(
            'INSERT INTO usuarios (nombre, apellidos,correo, telf,contraseña,seleccion) VALUES ($1, $2, $3,$4,$5,$6) RETURNING *',
            [nombre, apellidos,correo,telefono,hashedPassword,seleccion]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error al registrar el usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { correo, contraseña } = req.body;
    try {
        // 1. Buscamos al usuario solo por su correo (que debe ser único)
        const { rows } = await pool.query(
            'SELECT * FROM usuarios WHERE correo = $1 ',
            [correo]
        );

        if (rows.length === 0) {
            // No revelamos si el usuario existe o no, es más seguro.
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = rows[0];

        // 2. Comparamos la contraseña enviada con el hash guardado en la BD
        const esValida = await bcrypt.compare(contraseña, usuario.contraseña);

        if (!esValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // 3. Si la contraseña es válida, generamos el token
        // (Aquí corregimos el segundo error)
        const token = jwt.sign(
            { userId: usuario.idUser, admin: usuario.admin }, // Payload: info útil del usuario
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Enviamos UNA SOLA respuesta con el token y los datos del usuario (sin la contraseña)
        res.json({
            token,
            user: {
                id: usuario.idUser,
                nombre: usuario.nombre,
                apellidos: usuario.apellidos,
                telf: usuario.telf,
                admin: usuario.admin
            }
        });

    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
app.get('/api/auth/perfil', verificarToken, async (req, res) => {
    try {
        console.log(`Petición recibida para obtener el perfil del usuario con ID: ${req.user.userId}`);
        const { rows } = await pool.query(
            'SELECT "idUser", nombre, apellidos, telf FROM usuarios WHERE "idUser" = $1',
            [req.user.userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener el perfil del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
app.put('/api/auth/perfil', verificarToken, async (req, res) => {
    const { nombre, apellido, telefono, contraseña } = req.body;
    try {
        console.log(`Petición recibida para actualizar el perfil del usuario con ID: ${req.user.userId}`);
        
        // Si se proporciona una nueva contraseña, la hasheamos
        let hashedPassword = null;
        if (contraseña) {
            hashedPassword = await bcrypt.hash(contraseña, saltRounds);
        }

        const query = `
            UPDATE usuarios 
            SET nombre = $1, apellidos = $2, telf = $3, contraseña = COALESCE($4, contraseña)
            WHERE "idUser" = $5 
            RETURNING "idUser", nombre, apellidos, telf
        `;
        const values = [nombre, apellido, telefono, hashedPassword, req.user.userId];
        
        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al actualizar el perfil del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
app.get('/api/pedidos/mis-pedidos', async (req, res) => {
    const { userId } = req.query; // Asumiendo que el ID del usuario se pasa como parámetro de consulta
    try {
        console.log(`Petición recibida para obtener los pedidos del usuario con ID: ${userId}`);
        const query = `
            SELECT p.*, pr.nombre AS productoNombre 
            FROM pedidos AS p
            LEFT JOIN producto AS pr ON p.producto = pr.idProduct
            WHERE p.comprador = $1 AND p.estado != 'cancelado'
            ORDER BY p.idPedido DESC
        `;
        const { rows } = await pool.query(query, [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron pedidos para este usuario' });
        }
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener los pedidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


app.put('/api/pedidos/:id', async (req, res) => {
    const { id } = req.params;
    const { estado, cantidad } = req.body; // Asegúrate de que el cuerpo de la solicitud tenga el campo 'estado'
    try {
        console.log(`Petición recibida para actualizar el pedido con ID: ${id}`);
        const { rows } = await pool.query(
            'UPDATE pedidos SET estado = $1, cantidad = $2 WHERE idPedido = $3 RETURNING *',
            [estado, cantidad, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al actualizar el pedido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});



// Endpoint para guardar URLs de multimedia (imágenes/videos) en la base de datos
app.post('/api/multimedia', verificarToken, esAdmin, async (req, res) => {
    const { producto, urls } = req.body; // urls será un array de objetos con {url, tipo}
    
    if (!producto || !urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'Producto y URLs son requeridos' });
    }

    try {
        console.log(`Guardando ${urls.length} archivos multimedia para el producto ${producto}`);
        
        // Insertar múltiples archivos multimedia
        const insertPromises = urls.map(({ url, tipo }) => {
            return pool.query(
                'INSERT INTO multimedia (producto, url, tipo) VALUES ($1, $2, $3) RETURNING *',
                [producto, url, tipo || 'image']
            );
        });

        const results = await Promise.all(insertPromises);
        const multimedia = results.map(result => result.rows[0]);

        res.status(201).json({
            message: 'Multimedia guardada exitosamente',
            multimedia
        });
    } catch (error) {
        console.error('Error al guardar multimedia:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para obtener multimedia de un producto
app.get('/api/multimedia/:productoId', async (req, res) => {
    const { productoId } = req.params;
    
    try {
        console.log(`Obteniendo multimedia para el producto ${productoId}`);
        const { rows } = await pool.query(
            'SELECT * FROM multimedia WHERE producto = $1 ORDER BY idmulti ASC',
            [productoId]
        );
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener multimedia:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para eliminar multimedia
app.delete('/api/multimedia/:id', verificarToken, esAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        console.log(`Eliminando multimedia con ID: ${id}`);
        const { rows } = await pool.query(
            'DELETE FROM multimedia WHERE idmulti = $1 RETURNING *',
            [id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Multimedia no encontrada' });
        }
        
        res.json({ message: 'Multimedia eliminada exitosamente' });
    } catch (error) {
        console.error('Error al eliminar multimedia:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para reemplazar toda la multimedia de un producto
app.put('/api/multimedia/replace/:productoId', verificarToken, esAdmin, async (req, res) => {
    const { productoId } = req.params;
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'URLs son requeridas y deben ser un array' });
    }

    try {
        console.log(`Reemplazando multimedia del producto ${productoId}`);
        
        // 1. Obtener multimedia existente (para eliminar de Cloudinary después)
        const { rows: multimediaAnterior } = await pool.query(
            'SELECT * FROM multimedia WHERE producto = $1',
            [productoId]
        );
        
        console.log(`Encontradas ${multimediaAnterior.length} multimedia anteriores para eliminar`);
        
        // 2. Eliminar toda la multimedia anterior de la BD
        await pool.query('DELETE FROM multimedia WHERE producto = $1', [productoId]);
        
        // 3. Insertar nueva multimedia
        const insertPromises = urls.map(({ url, tipo }) => {
            return pool.query(
                'INSERT INTO multimedia (producto, url, tipo) VALUES ($1, $2, $3) RETURNING *',
                [productoId, url, tipo || 'image']
            );
        });

        const results = await Promise.all(insertPromises);
        const nuevaMultimedia = results.map(result => result.rows[0]);

        console.log(`Insertadas ${nuevaMultimedia.length} nuevas multimedia`);

        // 4. TODO: Aquí podrías agregar lógica para eliminar de Cloudinary las imágenes anteriores
        // Por ahora solo loggeamos las URLs que deberían eliminarse
        if (multimediaAnterior.length > 0) {
            console.log('URLs que podrían eliminarse de Cloudinary:');
            multimediaAnterior.forEach(media => {
                console.log(`- ${media.url}`);
            });
        }

        res.json({
            message: `Multimedia reemplazada exitosamente. ${multimediaAnterior.length} eliminadas, ${nuevaMultimedia.length} agregadas`,
            eliminadas: multimediaAnterior.length,
            agregadas: nuevaMultimedia.length,
            multimedia: nuevaMultimedia
        });
    } catch (error) {
        console.error('Error al reemplazar multimedia:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para corregir URLs de Cloudinary problemáticas
app.post('/api/multimedia/fix-urls', verificarToken, esAdmin, async (req, res) => {
    try {
        console.log('Corrigiendo URLs problemáticas de multimedia');
        
        // Obtener todas las URLs que contienen el timestamp problemático
        const { rows } = await pool.query(
            'SELECT * FROM multimedia WHERE url LIKE $1 OR url LIKE $2',
            ['%/v1760291318/%', '%v1760291318%']
        );
        
        let corregidas = 0;
        
        for (const multimedia of rows) {
            // Extraer public_id de la URL problemática
            const match = multimedia.url.match(/\/v\d+\/([^\/]+)$/);
            if (match) {
                const filename = match[1]; // Esto incluye la extensión
                const resourceType = multimedia.tipo || 'image';
                
                // Generar nueva URL sin el timestamp problemático
                const newUrl = `https://res.cloudinary.com/dmyrtncnm/${resourceType}/upload/${filename}`;
                
                // Actualizar en base de datos
                await pool.query(
                    'UPDATE multimedia SET url = $1 WHERE idmulti = $2',
                    [newUrl, multimedia.idmulti]
                );
                
                corregidas++;
                console.log(`URL corregida: ${multimedia.url} -> ${newUrl}`);
            }
        }
        
        res.json({
            message: `${corregidas} URLs corregidas exitosamente`,
            corregidas
        });
    } catch (error) {
        console.error('Error al corregir URLs:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============ ENDPOINTS DE PRODUCTOS ============

// Obtener todos los productos con selección
app.get('/api/productos', async (req, res) => {
    try {
        console.log('Petición recibida para obtener todos los productos');
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
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un producto específico
app.get('/api/producto/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Petición recibida para obtener el producto con ID: ${id}`);
        const query = `
            SELECT p.*, s."Nombre" AS seleccionNombre 
            FROM producto AS p
            LEFT JOIN selecciones AS s ON p.seleccion = s."idSelec"
            WHERE p."idProduct" = $1 AND p.activo = true
        `;
        const { rows } = await pool.query(query, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener el producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear un nuevo producto
app.post('/api/producto', verificarToken, esAdmin, async (req, res) => {
    const { nombre, descripcion, seleccion, genero, top } = req.body;
    try {
        console.log('Petición recibida para crear un nuevo producto');
        const { rows } = await pool.query(
            'INSERT INTO producto (nombre, descripcion, seleccion, genero, top, activo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [nombre, descripcion, seleccion, genero, top || false, true]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error al crear el producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Actualizar un producto
app.put('/api/producto/:id', verificarToken, esAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, seleccion, genero, top } = req.body;
    try {
        console.log(`Petición recibida para actualizar el producto con ID: ${id}`);
        const { rows } = await pool.query(
            'UPDATE producto SET nombre = $1, descripcion = $2, seleccion = $3, genero = $4, top = $5 WHERE "idProduct" = $6 RETURNING *',
            [nombre, descripcion, seleccion, genero, top || false, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al actualizar el producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar un producto (soft delete)
app.delete('/api/producto/:id', verificarToken, esAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Petición recibida para eliminar el producto con ID: ${id}`);
        const { rows } = await pool.query(
            'UPDATE producto SET activo = false WHERE "idProduct" = $1 RETURNING *',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar el producto:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============ ENDPOINTS DE SELECCIONES ============

// Obtener todas las selecciones
app.get('/api/selecciones', async (req, res) => {
    try {
        console.log('Petición recibida para obtener todas las selecciones');
        const { rows } = await pool.query('SELECT * FROM selecciones ORDER BY "Nombre" ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener selecciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Crear una nueva selección
app.post('/api/selecciones', verificarToken, esAdmin, async (req, res) => {
    const { nombre, datos } = req.body;
    try {
        console.log('Petición recibida para crear una nueva selección');
        const { rows } = await pool.query(
            'INSERT INTO selecciones (nombre, datos) VALUES ($1, $2) RETURNING *',
            [nombre, datos || '']
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error al crear la selección:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ============ ENDPOINTS DE PEDIDOS ACTUALIZADOS ============

// Crear un nuevo pedido
app.post('/api/pedidos', verificarToken, async (req, res) => {
    const { producto, cantidad, comprador } = req.body;
    try {
        console.log('Petición recibida para crear un nuevo pedido');
        const { rows } = await pool.query(
            'INSERT INTO pedidos (producto, cantidad, comprador, estado) VALUES ($1, $2, $3, $4) RETURNING *',
            [producto, cantidad, comprador || req.user.userId, 'pendiente']
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error al crear el pedido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener todos los pedidos (admin)
app.get('/api/pedidos', verificarToken, esAdmin, async (req, res) => {
    try {
        console.log('Petición recibida para obtener todos los pedidos');
        const query = `
            SELECT p.*, pr.nombre AS productoNombre, u.nombre AS usuarioNombre, u.apellidos AS usuarioApellidos
            FROM pedidos AS p
            LEFT JOIN producto AS pr ON p.producto = pr.idProduct
            LEFT JOIN usuarios AS u ON p.comprador = u.idusuario
            ORDER BY p.idPedido DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 5. Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
