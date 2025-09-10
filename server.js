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
        console.log(`Petición recibida para buscar perfumes con el término: ${q}`);
        const query = `
            SELECT p.*, m.nombre AS marcaP
            FROM perfume AS p
            INNER JOIN marcas AS m ON p.marca = m.idmarca
            WHERE p.activo = true AND (p.nombre ILIKE $1 OR m.nombre ILIKE $1)
        `;
        const { rows } = await pool.query(query, [`%${q}%`]);
        res.json(rows);
    } catch (error) {
        console.error('Error al buscar perfumes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Ruta para obtener todos los perfumes
app.get('/api/perfumes', async (req, res) => {
    try {
        console.log("Petición recibida en /api/perfume");
        const query = `
            SELECT p.*, m.nombre AS marcaP
            FROM perfume AS p
            INNER JOIN marcas AS m ON p.marca = m.idmarca
            WHERE p.activo = true
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener perfumes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/perfume/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Petición recibida para obtener el perfume con ID: ${id}`);
        const query = `
            SELECT p.*, m.nombre AS marcaP
            FROM perfume AS p
            INNER JOIN marcas AS m ON p.marca = m.idmarca
            WHERE p.idperfume = $1
        `;
        const { rows } = await pool.query(query, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'perfume no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener el perfume:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
app.get('/api/perfume/genero/:genero', async (req, res) => {
    const { genero } = req.params;
    try {
        console.log(`Petición recibida para obtener perfumes de género: ${genero}`);
        const query = `
            SELECT p.*, m.nombre AS marcaP
            FROM perfume AS p
            INNER JOIN marcas AS m ON p.marca = m.idmarca
            WHERE p.genero = $1 AND p.activo = true
        `;
        const { rows } = await pool.query(query, [genero]);
        res.json(rows); // Se devuelve un array vacío si no hay resultados, no un error 404
    } catch (error) {
        console.error('Error al obtener perfumes por género:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
app.get('/api/selecciones', async (req, res) => {
    try {
        console.log("Petición recibida para obtener todas las selecciones");
        const { rows } = await pool.query('SELECT * FROM selecciones');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener selecciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
   
});
app.post('/api/perfume', async (req, res) => {
    const { nombre, marca, top, descripcion,clima,genero } = req.body;
    try {
        console.log("Petición recibida para crear un nuevo perfume");
        const { rows } = await pool.query(
            'INSERT INTO perfume (nombre, marca, top, descripcion,clima,genero) VALUES ($1, $2, $3, $4,$5,$6) RETURNING *',
            [nombre, marca, top, descripcion,clima,genero]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error al crear el perfume:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
app.put('/api/perfume/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, marca, top, descripcion,clima,genero} = req.body;
    try {
        console.log(`Petición recibida para actualizar el perfume con ID: ${id}`);
        const { rows } = await pool.query(
            'UPDATE perfume SET nombre = $1, marca = $2, top = $3, descripcion = $4,clima=$5,genero=$6 WHERE idperfume = $7 RETURNING *',
            [nombre, marca, top, descripcion,clima,genero, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'perfume no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al actualizar el perfume:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/perfume/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Petición recibida para eliminar el perfume con ID: ${id}`);
        const { rowCount } = await pool.query('UPDATE perfume SET activo=false WHERE idperfume = $1', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: 'perfume no encontrado' });
        }
        res.status(204).send(); // No content
    } catch (error) {
        console.error('Error al eliminar el perfume:', error);
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
        const { rows } = await pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 AND estado!="cancelado" ', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron pedidos para este usuario' });
        }
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener los pedidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


app.post('/api/pedidos', async (req, res) => {
 
    const productosDelPedido = req.body;
    
    if (!Array.isArray(productosDelPedido) || productosDelPedido.length === 0) {
        return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un array de productos y no puede estar vacío.' });
    }

    const client = await pool.connect(); // Obtenemos un cliente de la pool de conexiones

    try {
        // 2. Iniciamos una TRANSACCIÓN.
        await client.query('BEGIN');

        console.log("Procesando un nuevo pedido con ID temporal:", productosDelPedido[0].idpedidotemp);
        console.log("Productos del pedido:", productosDelPedido);


        const filasInsertadas = [];

        // 3. Usamos un bucle for...of para poder usar await dentro.
        for (const producto of productosDelPedido) {
            const { idperfume, cantidad, fecha, idpedidotemp } = producto;
            
            // Validamos que cada producto tenga los campos necesarios
            if (!idperfume || !cantidad || !fecha || !idpedidotemp) {
                throw new Error('Cada producto debe contener idperfume, cantidad, fecha y idpedidotemp.');
            }

            const query = `
                INSERT INTO pedido (idperfume, idusuario, cantidad, fecha, "idPedidoTemp") 
                VALUES ($1, NULL, $2, $3, $4) 
                RETURNING *`; // RETURNING * nos devuelve la fila completa que se insertó

            const values = [idperfume, cantidad, fecha, idpedidotemp];
            
            const { rows } = await client.query(query, values);
            
            // 4. Guardamos cada fila insertada para devolverla al final.
            filasInsertadas.push(rows[0]);
        }

        // 5. Si el bucle se completó sin errores, confirmamos la transacción.
        await client.query('COMMIT');
        
        // 6. Enviamos de vuelta el array con todos los productos insertados.
        console.log("Pedido insertado correctamente en la BD.");
        res.status(201).json(filasInsertadas);

    } catch (error) {
        // 7. Si ocurre CUALQUIER error, revertimos la transacción.
        await client.query('ROLLBACK');
        console.error('Error al procesar el pedido, se hizo ROLLBACK:', error.message);
        res.status(500).json({ error: 'Error interno del servidor al procesar el pedido.', details: error.message });
    } finally {
        // 8. Liberamos el cliente para que pueda ser usado por otra petición.
        client.release();
    }
});

app.put('/api/pedidos/:id', async (req, res) => {
    const { id } = req.params;
    const { estado,cantidad } = req.body; // Asegúrate de que el cuerpo de la solicitud tenga el campo 'estado'
    try {
        console.log(`Petición recibida para actualizar el pedido con ID: ${id}`);
        const { rows } = await pool.query(
            'UPDATE pedidos SET estado = $1, cantidad=$2 WHERE idpedido = $3 RETURNING *',
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

// pedidos admin
app.get('/api/pedidos/admin/todos-pedidos', async (req, res) => {
    try {
        console.log("Petición recibida para obtener todos los pedidos");
        const { rows } = await pool.query(`
    SELECT
        p.idpedido,
        u.nombre AS nombre_usuario,
        u.apellidos AS apellidos_usuario,
        perf.nombre AS nombre_perfume,
        p.cantidad,
        p.estado
    FROM
        pedidos AS p
    INNER JOIN
        usuarios AS u ON p.idusuario = u.idusuario
    INNER JOIN
        perfume AS perf ON p.idperfume = perf.idperfume
    WHERE
        p.estado = 'confirmado'
`);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron pedidos' });
        }
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener los pedidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/pedidos/admin/todos', async (req, res) => {
    try {
        console.log("Petición recibida para obtener todos los pedidos");
        const { rows } = await pool.query(`
  SELECT
        p.idpedido,
        u.nombre AS nombre_usuario,
        u.apellidos AS apellidos_usuario,
        perf.nombre AS nombre_perfume,
        p.cantidad,
        p.estado
    FROM
        pedidos AS p
    INNER JOIN
        usuarios AS u ON p.idusuario = u.idusuario
    INNER JOIN
        perfume AS perf ON p.idperfume = perf.idperfume
    WHERE

        p.estado = 'pendiente'
`);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron pedidos' });
        }
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener los pedidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/pedidos/admin/confirmar/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Petición recibida para confirmar el pedido con ID: ${id}`);
        const { rows } = await pool.query(
            'UPDATE pedidos SET estado = "confirmado" WHERE idpedido = $1 RETURNING *',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al confirmar el pedido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/pedidos/temporales', async (req, res) => {
    const { pedidos } = req.body;
    if (!Array.isArray(pedidos)) {
        return res.status(400).json({ error: 'Formato de pedidos inválido' });
    }
    try {
        // Obtener detalles de cada perfume
        const ids = pedidos.map(p => p.idperfume);
        if (ids.length === 0) return res.json({ pedidos: [] });

        const { rows } = await pool.query(
            `SELECT p.*, m.nombre AS marcap
            FROM perfume AS p
            INNER JOIN marcas AS m ON p.marca = m.idmarca
            WHERE p.activo = true AND idperfume = ANY($1)`,
            [ids]
        );
        // Unir info de pedido con info de perfume
         
        const pedidosEnriquecidos = pedidos.map(p => ({
            ...p,
            perfume: rows.find(r => r.idperfume === p.idperfume)
        }));
        res.json({ pedidos: pedidosEnriquecidos });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// 5. Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
