// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, getDatabaseInfo, executeQuery, USE_TEST_DB } = require('./config/database');
const saltRounds = 10;

const app = express();
const port = process.env.PORT || 3001;

// Mostrar información de la base de datos actual
const dbInfo = getDatabaseInfo();
console.log(`🚀 Iniciando servidor con ${dbInfo.type} (${dbInfo.environment})`);
console.log('Host local:', process.env.DATABASE_URL);

// Configuración de CORS para aceptar solo el FRONTEND_URL
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
};

// Verificar conexión a la base de datos
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ ¡ERROR FATAL AL CONECTAR CON LA BASE DE DATOS!', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release(); // Es importante liberar el cliente después de usarlo
    if (err) {
      return console.error('❌ Error ejecutando la consulta de prueba', err.stack);
    }
    const timeResult = result.rows[0].now || result.rows[0]['NOW()'];
    console.log(
      `✅ ¡Conexión a ${dbInfo.type} verificada exitosamente! Hora de la DB:`,
      timeResult
    );
  });
});
app.use(cors(corsOptions));

app.use(express.json());

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(403).json({ error: 'Token requerido' });
  }

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

const ESTADO_CARRITO = 'carrito';
const ESTADO_CONFIRMADO = 'confirmado';

const obtenerDetallePedido = async (pedidoId) => {
  const detalleQuery = `
        SELECT 
            p."idPedido" AS "idPedido",
            p.producto,
            p.cantidad,
            p.estado,
            p."created_at" AS "created_at",
            pr.nombre AS "productoNombre",
            pr.genero AS "genero",
            s."Nombre" AS "seleccionNombre"
        FROM pedidos AS p
        LEFT JOIN producto AS pr ON p.producto = pr."idProduct"
        LEFT JOIN selecciones AS s ON pr.seleccion = s."idSelec"
        WHERE p."idPedido" = $1
    `;

  const { rows } = await executeQuery(detalleQuery, [pedidoId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerPedidosUsuarioPorEstado = async (userId, estado) => {
  const carritoQuery = `
        SELECT
            p."idPedido" AS "idPedido",
            p.producto,
            p.cantidad,
            p.estado,
            p."created_at" AS "created_at",
            pr.nombre AS "productoNombre",
            pr.descripcion AS "descripcion",
            pr.genero AS "genero",
            s."Nombre" AS "seleccionNombre",
            (
                SELECT url
                FROM multimedia
                WHERE multimedia.producto = pr."idProduct"
                ORDER BY multimedia.idmulti ASC
                LIMIT 1
            ) AS img
        FROM pedidos AS p
        LEFT JOIN producto AS pr ON p.producto = pr."idProduct"
        LEFT JOIN selecciones AS s ON pr.seleccion = s."idSelec"
        WHERE p.comprador = $1 AND p.estado = $2
        ORDER BY p."idPedido" DESC
    `;

  const { rows } = await executeQuery(carritoQuery, [userId, estado]);
  return rows;
};

const limpiarPedidosPorEstado = async (userId, estado) => {
  const deleteQuery = `
        DELETE FROM pedidos
        WHERE comprador = $1 AND estado = $2
    `;

  await executeQuery(deleteQuery, [userId, estado]);
};

app.get('/api/carrito', verificarToken, async (req, res) => {
  try {
    const items = await obtenerPedidosUsuarioPorEstado(req.user.userId, ESTADO_CARRITO);
    res.json(items);
  } catch (error) {
    console.error('Error al obtener el carrito:', error);
    res.status(500).json({ error: 'No se pudo obtener el carrito' });
  }
});

app.post('/api/carrito', verificarToken, async (req, res) => {
  const { productoId, cantidad = 1 } = req.body;

  const parsedCantidad = Number(cantidad);
  if (!productoId || !Number.isFinite(parsedCantidad) || parsedCantidad <= 0) {
    return res.status(400).json({ error: 'Datos de carrito inválidos' });
  }

  try {
    const buscarExistenteQuery = `
            SELECT "idPedido", cantidad
            FROM pedidos
            WHERE comprador = $1 AND producto = $2 AND estado = $3
            LIMIT 1
        `;

    const { rows: existentes } = await executeQuery(buscarExistenteQuery, [
      req.user.userId,
      productoId,
      ESTADO_CARRITO,
    ]);

    if (existentes.length > 0) {
      const registro = existentes[0];
      const registroId = registro.idPedido || registro.idpedido;
      const nuevaCantidad = (Number(registro.cantidad) || 0) + parsedCantidad;

      const updateQuery = `
                UPDATE pedidos
                SET cantidad = $1
                WHERE "idPedido" = $2
            `;

      await executeQuery(updateQuery, [nuevaCantidad, registroId]);
    } else {
      const insertQuery = `
                INSERT INTO pedidos (producto, cantidad, comprador, estado)
                VALUES ($1, $2, $3, $4)
            `;

      await executeQuery(insertQuery, [
        productoId,
        parsedCantidad,
        req.user.userId,
        ESTADO_CARRITO,
      ]);
    }

    const items = await obtenerPedidosUsuarioPorEstado(req.user.userId, ESTADO_CARRITO);
    res.status(201).json(items);
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    res.status(500).json({ error: 'No se pudo actualizar el carrito' });
  }
});

app.put('/api/carrito/:productoId', verificarToken, async (req, res) => {
  const { productoId } = req.params;
  const { cantidad } = req.body;

  const parsedCantidad = Number(cantidad);
  if (!Number.isFinite(parsedCantidad)) {
    return res.status(400).json({ error: 'Cantidad inválida' });
  }

  try {
    if (parsedCantidad <= 0) {
      const deleteQuery = `
                DELETE FROM pedidos
                WHERE comprador = $1 AND producto = $2 AND estado = $3
            `;
      await executeQuery(deleteQuery, [req.user.userId, productoId, ESTADO_CARRITO]);
    } else {
      const updateQuery = `
                UPDATE pedidos
                SET cantidad = $1
                WHERE comprador = $2 AND producto = $3 AND estado = $4
            `;

      await executeQuery(updateQuery, [
        parsedCantidad,
        req.user.userId,
        productoId,
        ESTADO_CARRITO,
      ]);
    }

    const items = await obtenerPedidosUsuarioPorEstado(req.user.userId, ESTADO_CARRITO);
    res.json(items);
  } catch (error) {
    console.error('Error al actualizar el carrito:', error);
    res.status(500).json({ error: 'No se pudo actualizar el carrito' });
  }
});

app.delete('/api/carrito/:productoId', verificarToken, async (req, res) => {
  const { productoId } = req.params;

  try {
    const deleteQuery = `
            DELETE FROM pedidos
            WHERE comprador = $1 AND producto = $2 AND estado = $3
        `;

    await executeQuery(deleteQuery, [req.user.userId, productoId, ESTADO_CARRITO]);
    const items = await obtenerPedidosUsuarioPorEstado(req.user.userId, ESTADO_CARRITO);
    res.json(items);
  } catch (error) {
    console.error('Error al eliminar del carrito:', error);
    res.status(500).json({ error: 'No se pudo eliminar el artículo del carrito' });
  }
});

app.delete('/api/carrito', verificarToken, async (req, res) => {
  try {
    await limpiarPedidosPorEstado(req.user.userId, ESTADO_CARRITO);
    res.status(204).send();
  } catch (error) {
    console.error('Error al vaciar el carrito:', error);
    res.status(500).json({ error: 'No se pudo vaciar el carrito' });
  }
});

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

    const { rows } = await executeQuery(query, [`%${q}%`]);
    res.json(rows);
  } catch (error) {
    console.error('Error al buscar productos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// api registro y login
app.post('/api/auth/register', async (req, res) => {
  const { nombre, apellidos, telefono, contraseña, correo, seleccion } = req.body;
  const hashedPassword = await bcrypt.hash(contraseña, saltRounds);
  try {
    console.log('Petición recibida para registrar un nuevo usuario');
    const { rows } = await executeQuery(
      'INSERT INTO usuarios (nombre, apellidos,correo, telf,contraseña,seleccion) VALUES ($1, $2, $3,$4,$5,$6) RETURNING *',
      [nombre, apellidos, correo, telefono, hashedPassword, seleccion]
    );
    res.status(201).json(rows[0] || { message: 'Usuario registrado exitosamente' });
  } catch (error) {
    console.error('Error al registrar el usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { correo, contraseña } = req.body;
  try {
    // 1. Buscamos al usuario solo por su correo (que debe ser único)
    const { rows } = await executeQuery('SELECT * FROM usuarios WHERE correo = $1 ', [correo]);

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
      { userId: usuario.idUser || usuario.idusuario, admin: usuario.admin }, // Payload: info útil del usuario
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Enviamos UNA SOLA respuesta con el token y los datos del usuario (sin la contraseña)
    res.json({
      token,
      user: {
        id: usuario.idUser || usuario.idusuario,
        nombre: usuario.nombre,
        apellidos: usuario.apellidos,
        telf: usuario.telf,
        admin: usuario.admin,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
app.get('/api/auth/perfil', verificarToken, async (req, res) => {
  try {
    console.log(`Petición recibida para obtener el perfil del usuario con ID: ${req.user.userId}`);
    const perfilQuery = `
            SELECT u."idUser", u.nombre, u.apellidos, u.telf, u.seleccion,
                   s."Nombre" AS "seleccionNombre",
                   s."Datos" AS "seleccionDatos"
            FROM usuarios AS u
            LEFT JOIN selecciones AS s ON u.seleccion = s."idSelec"
            WHERE u."idUser" = $1
        `;
    const { rows } = await executeQuery(perfilQuery, [req.user.userId]);
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
  const { nombre, apellido, telefono, contraseña, seleccion } = req.body;
  try {
    console.log(
      `Petición recibida para actualizar el perfil del usuario con ID: ${req.user.userId}`
    );

    if (!seleccion) {
      return res.status(400).json({ error: 'La selección es obligatoria' });
    }

    // Si se proporciona una nueva contraseña, la hasheamos
    let hashedPassword = null;
    if (contraseña) {
      hashedPassword = await bcrypt.hash(contraseña, saltRounds);
    }

    const updateQuery = `
            UPDATE usuarios 
            SET nombre = $1, apellidos = $2, telf = $3, contraseña = COALESCE($4, contraseña), seleccion = $5
            WHERE "idUser" = $6
        `;
    const values = [nombre, apellido, telefono, hashedPassword, seleccion, req.user.userId];

    const resultadoActualizacion = await executeQuery(updateQuery, values);

    // Verificar si se actualizó algún registro (MySQL y PostgreSQL tienen propiedades distintas)
    const actualizoRegistro =
      (resultadoActualizacion.rowCount && resultadoActualizacion.rowCount > 0) ||
      (Array.isArray(resultadoActualizacion.rows)
        ? resultadoActualizacion.rows.length > 0
        : resultadoActualizacion.rows && resultadoActualizacion.rows.affectedRows > 0);

    if (!actualizoRegistro) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const perfilActualizadoQuery = `
            SELECT u."idUser", u.nombre, u.apellidos, u.telf, u.seleccion,
                   s."Nombre" AS "seleccionNombre",
                   s."Datos" AS "seleccionDatos"
            FROM usuarios AS u
            LEFT JOIN selecciones AS s ON u.seleccion = s."idSelec"
            WHERE u."idUser" = $1
        `;
    const { rows } = await executeQuery(perfilActualizadoQuery, [req.user.userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al actualizar el perfil del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
app.get('/api/pedidos/mis-pedidos', verificarToken, async (req, res) => {
  try {
    console.log(
      `Petición recibida para obtener los pedidos del usuario con ID: ${req.user.userId}`
    );
    const query = `
            SELECT 
                p."idPedido", 
                p.producto, 
                p.cantidad, 
                p.estado, 
                p.created_at,
                pr.nombre AS "productoNombre",
                pr.descripcion AS "productoDescripcion",
                pr.genero AS "productoGenero",
                s."Nombre" AS "seleccionNombre",
                (
                    SELECT url
                    FROM multimedia
                    WHERE multimedia.producto = pr."idProduct"
                    ORDER BY multimedia.idmulti ASC
                    LIMIT 1
                ) AS img
            FROM pedidos AS p
            LEFT JOIN producto AS pr ON p.producto = pr."idProduct"
            LEFT JOIN selecciones AS s ON pr.seleccion = s."idSelec"
            WHERE p.comprador = $1 AND p.estado != 'carrito'
            ORDER BY p."idPedido" DESC
        `;
    const { rows } = await executeQuery(query, [req.user.userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener los pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/pedidos/checkout', verificarToken, async (req, res) => {
  const { items, pago } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe incluir al menos un producto' });
  }

  const formatoInvalido = items.some((item) => {
    const productoId = item?.productoId ?? item?.producto;
    const cantidad = Number(item?.cantidad);
    return !productoId || !Number.isFinite(cantidad) || cantidad <= 0;
  });

  if (formatoInvalido) {
    return res.status(400).json({ error: 'Verifica los productos y cantidades del pedido' });
  }

  if (!pago || !pago.titular || !pago.referencia) {
    return res.status(400).json({ error: 'Faltan datos del pago de demostración' });
  }

  try {
    console.log(
      `Confirmando checkout para el usuario ${req.user.userId} con ${items.length} artículos`
    );

    const carritoActual = await obtenerPedidosUsuarioPorEstado(req.user.userId, ESTADO_CARRITO);
    const carritoMap = new Map();
    carritoActual.forEach((registro) => {
      carritoMap.set(String(registro.producto), registro);
    });

    const pedidosConfirmados = [];

    for (const item of items) {
      const productoId = item.productoId ?? item.producto;
      const cantidad = Number(item.cantidad);
      const registroExistente = carritoMap.get(String(productoId));

      if (registroExistente) {
        const pedidoId = registroExistente.idPedido || registroExistente.idpedido;
        const updateQuery = `
                    UPDATE pedidos
                    SET cantidad = $1, estado = $2
                    WHERE "idPedido" = $3
                `;

        await executeQuery(updateQuery, [cantidad, ESTADO_CONFIRMADO, pedidoId]);

        const detalle = await obtenerDetallePedido(pedidoId);
        pedidosConfirmados.push(
          detalle || {
            idPedido: pedidoId,
            producto: productoId,
            cantidad,
            estado: ESTADO_CONFIRMADO,
          }
        );

        carritoMap.delete(String(productoId));
      } else {
        const insertQuery = `
                    INSERT INTO pedidos (producto, cantidad, comprador, estado)
                    VALUES ($1, $2, $3, $4)
                    RETURNING "idPedido"
                `;

        const { rows: insercion } = await executeQuery(insertQuery, [
          productoId,
          cantidad,
          req.user.userId,
          ESTADO_CONFIRMADO,
        ]);

        let pedidoId = null;

        if (Array.isArray(insercion) && insercion.length > 0) {
          pedidoId = insercion[0].idPedido ?? insercion[0].idpedido;
        } else if (USE_TEST_DB && insercion && typeof insercion.insertId !== 'undefined') {
          pedidoId = insercion.insertId;
        }

        if (!pedidoId) {
          throw new Error('No fue posible confirmar uno de los productos del pedido');
        }

        const detalle = await obtenerDetallePedido(pedidoId);
        pedidosConfirmados.push(
          detalle || {
            idPedido: pedidoId,
            producto: productoId,
            cantidad,
            estado: ESTADO_CONFIRMADO,
          }
        );
      }
    }

    if (carritoMap.size > 0) {
      for (const registro of carritoMap.values()) {
        const registroId = registro.idPedido || registro.idpedido;
        if (!registroId) {
          continue;
        }

        const deleteQuery = `
                    DELETE FROM pedidos
                    WHERE "idPedido" = $1
                `;

        await executeQuery(deleteQuery, [registroId]);
      }
    }

    res.status(201).json({
      message: 'Pedido confirmado en modo demostración',
      pedidos: pedidosConfirmados,
      pago: {
        metodo: pago.metodo,
        titular: pago.titular,
        referencia: pago.referencia,
      },
    });
  } catch (error) {
    console.error('Error durante el checkout:', error);
    res.status(500).json({ error: 'No se pudo completar el checkout' });
  }
});

app.put('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { estado, cantidad } = req.body; // Asegúrate de que el cuerpo de la solicitud tenga el campo 'estado'
  try {
    console.log(`Petición recibida para actualizar el pedido con ID: ${id}`);
    const { rows } = await executeQuery(
      'UPDATE pedidos SET estado = $1, cantidad = $2 WHERE "idPedido" = $3 RETURNING *',
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
      return executeQuery(
        'INSERT INTO multimedia (producto, url, tipo) VALUES ($1, $2, $3) RETURNING *',
        [producto, url, tipo || 'image']
      );
    });

    const results = await Promise.all(insertPromises);
    const multimedia = results.map((result) => result.rows[0]);

    res.status(201).json({
      message: 'Multimedia guardada exitosamente',
      multimedia,
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
    const { rows } = await executeQuery(
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
    const { rows } = await executeQuery('DELETE FROM multimedia WHERE idmulti = $1 RETURNING *', [
      id,
    ]);

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
    const { rows: multimediaAnterior } = await executeQuery(
      'SELECT * FROM multimedia WHERE producto = $1',
      [productoId]
    );

    console.log(`Encontradas ${multimediaAnterior.length} multimedia anteriores para eliminar`);

    // 2. Eliminar toda la multimedia anterior de la BD
    await executeQuery('DELETE FROM multimedia WHERE producto = $1', [productoId]);

    // 3. Insertar nueva multimedia
    const insertPromises = urls.map(({ url, tipo }) => {
      return executeQuery(
        'INSERT INTO multimedia (producto, url, tipo) VALUES ($1, $2, $3) RETURNING *',
        [productoId, url, tipo || 'image']
      );
    });

    const results = await Promise.all(insertPromises);
    const nuevaMultimedia = results.map((result) => result.rows[0]);

    console.log(`Insertadas ${nuevaMultimedia.length} nuevas multimedia`);

    // 4. TODO: Aquí podrías agregar lógica para eliminar de Cloudinary las imágenes anteriores
    // Por ahora solo loggeamos las URLs que deberían eliminarse
    if (multimediaAnterior.length > 0) {
      console.log('URLs que podrían eliminarse de Cloudinary:');
      multimediaAnterior.forEach((media) => {
        console.log(`- ${media.url}`);
      });
    }

    res.json({
      message: `Multimedia reemplazada exitosamente. ${multimediaAnterior.length} eliminadas, ${nuevaMultimedia.length} agregadas`,
      eliminadas: multimediaAnterior.length,
      agregadas: nuevaMultimedia.length,
      multimedia: nuevaMultimedia,
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
    const { rows } = await executeQuery(
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
        await executeQuery('UPDATE multimedia SET url = $1 WHERE idmulti = $2', [
          newUrl,
          multimedia.idmulti,
        ]);

        corregidas++;
        console.log(`URL corregida: ${multimedia.url} -> ${newUrl}`);
      }
    }

    res.json({
      message: `${corregidas} URLs corregidas exitosamente`,
      corregidas,
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

    // Parámetros de consulta opcionales
    const { seleccion, exclude, limit } = req.query;

    let whereConditions = ['p.activo = true'];
    let queryParams = [];
    let paramIndex = 1;

    // Filtro por selección
    if (seleccion) {
      whereConditions.push(`p.seleccion = $${paramIndex}`);
      queryParams.push(seleccion);
      paramIndex++;
    }

    // Excluir un producto específico
    if (exclude) {
      whereConditions.push(`p."idProduct" != $${paramIndex}`);
      queryParams.push(exclude);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');
    const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';

    const query = `
            SELECT DISTINCT ON (p."idProduct") 
                   p.*, 
                   s."Nombre" AS seleccionNombre,
                   m.url AS img
            FROM producto AS p
            LEFT JOIN selecciones AS s ON p.seleccion = s."idSelec"
            LEFT JOIN multimedia AS m ON p."idProduct" = m.producto
            WHERE ${whereClause}
            ORDER BY p."idProduct" DESC, m.idmulti ASC
            ${limitClause}
        `;

    const { rows } = await executeQuery(query, queryParams);
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
    const { rows } = await executeQuery(query, [id]);
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
    const { rows } = await executeQuery(
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
    const { rows } = await executeQuery(
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
    const { rows } = await executeQuery(
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
    const { rows } = await executeQuery('SELECT * FROM selecciones ORDER BY "Nombre" ASC');
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
    const { rows } = await executeQuery(
      'INSERT INTO selecciones ("Nombre", "Datos") VALUES ($1, $2) RETURNING *',
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
    const { rows } = await executeQuery(
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
            SELECT 
                p.*,
                pr.nombre AS "productoNombre",
                u.nombre AS "usuarioNombre",
                u.apellidos AS "usuarioApellidos"
            FROM pedidos AS p
            LEFT JOIN producto AS pr ON p.producto = pr."idProduct"
            LEFT JOIN usuarios AS u ON p.comprador = u."idUser"
            ORDER BY p."idPedido" DESC
        `;
    const { rows } = await executeQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
// ============ ENDPOINTS DE COMENTARIOS ============

// Obtener comentarios de un producto
app.get('/api/productos/:id/comentarios', async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`Petición recibida para obtener comentarios del producto con ID: ${id}`);
    const query = `
            SELECT c.*, u.nombre, u.apellidos
            FROM comentarios AS c
            LEFT JOIN usuarios AS u ON c.usuario = u."idUser"
            WHERE c.producto = $1
            ORDER BY c."idComent" DESC
        `;
    const { rows } = await executeQuery(query, [id]);

    // Formatear la respuesta para que coincida con lo que espera el frontend
    const comentariosFormateados = rows.map((comentario) => ({
      id: comentario.idComent || comentario.idcoment,
      contenido: comentario.contenido,
      createdAt: comentario.created_at,
      usuario: {
        nombre: comentario.nombre,
        apellidos: comentario.apellidos,
      },
    }));

    res.json(comentariosFormateados);
  } catch (error) {
    console.error('Error al obtener comentarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear un nuevo comentario
app.post('/api/productos/:id/comentarios', verificarToken, async (req, res) => {
  const { id } = req.params;
  const { contenido } = req.body;
  const userId = req.user.userId;

  if (!contenido || !contenido.trim()) {
    return res.status(400).json({ error: 'El contenido del comentario es requerido' });
  }

  try {
    console.log(`Petición recibida para crear comentario del usuario ${userId} en producto ${id}`);

    // Insertar el comentario
    const insertQuery = `
            INSERT INTO comentarios (contenido, usuario, producto) 
            VALUES ($1, $2, $3) 
            RETURNING *
        `;
    const { rows: comentarioRows } = await executeQuery(insertQuery, [
      contenido.trim(),
      userId,
      id,
    ]);

    let comentarioId = null;
    if (Array.isArray(comentarioRows) && comentarioRows.length > 0) {
      comentarioId = comentarioRows[0].idComent || comentarioRows[0].idcoment;
    } else if (USE_TEST_DB && comentarioRows?.insertId) {
      comentarioId = comentarioRows.insertId;
    }

    if (!comentarioId) {
      throw new Error('No se pudo crear el comentario');
    }

    const detalleQuery = `
            SELECT 
                c."idComent" AS "id",
                c.contenido,
                c."created_at" AS "created_at",
                u.nombre,
                u.apellidos
            FROM comentarios AS c
            LEFT JOIN usuarios AS u ON c.usuario = u."idUser"
            WHERE c."idComent" = $1
        `;
    const { rows: detalleRows } = await executeQuery(detalleQuery, [comentarioId]);
    const detalle = detalleRows[0];

    const comentarioCompleto = {
      id: detalle?.id || comentarioId,
      contenido: detalle?.contenido || contenido.trim(),
      createdAt: detalle?.created_at || new Date().toISOString(),
      usuario: {
        nombre: detalle?.nombre || 'Usuario',
        apellidos: detalle?.apellidos || '',
      },
    };

    res.status(201).json(comentarioCompleto);
  } catch (error) {
    console.error('Error al crear comentario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============ ENDPOINTS DE REPORTES (ADMIN) ============

// Obtener productos más vendidos
app.get('/api/reportes/productos-mas-vendidos', verificarToken, esAdmin, async (req, res) => {
  try {
    console.log('Petición recibida para obtener productos más vendidos');
    const query = `
            SELECT 
                p."idProduct",
                p.nombre,
                p.genero,
                s."Nombre" AS seleccionNombre,
                SUM(ped.cantidad) AS total_vendido,
                COUNT(DISTINCT ped."idPedido") AS num_pedidos,
                (
                    SELECT url
                    FROM multimedia
                    WHERE multimedia.producto = p."idProduct"
                    ORDER BY multimedia.idmulti ASC
                    LIMIT 1
                ) AS img
            FROM pedidos AS ped
            INNER JOIN producto AS p ON ped.producto = p."idProduct"
            LEFT JOIN selecciones AS s ON p.seleccion = s."idSelec"
            WHERE ped.estado = 'confirmado'
            GROUP BY p."idProduct", p.nombre, p.genero, s."Nombre"
            ORDER BY total_vendido DESC
            LIMIT 10
        `;
    const { rows } = await executeQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener productos más vendidos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener productos mejor calificados
app.get('/api/reportes/productos-mejor-calificados', verificarToken, esAdmin, async (req, res) => {
  try {
    console.log('Petición recibida para obtener productos mejor calificados');
    const query = `
            SELECT 
                p."idProduct",
                p.nombre,
                p.genero,
                s."Nombre" AS seleccionNombre,
                AVG(e.valoracion) AS promedio_estrellas,
                COUNT(e."idStar") AS num_calificaciones,
                (
                    SELECT url
                    FROM multimedia
                    WHERE multimedia.producto = p."idProduct"
                    ORDER BY multimedia.idmulti ASC
                    LIMIT 1
                ) AS img
            FROM estrellas AS e
            INNER JOIN producto AS p ON e.producto = p."idProduct"
            LEFT JOIN selecciones AS s ON p.seleccion = s."idSelec"
            WHERE p.activo = true
            GROUP BY p."idProduct", p.nombre, p.genero, s."Nombre"
            HAVING COUNT(e."idStar") >= 3
            ORDER BY promedio_estrellas DESC, num_calificaciones DESC
            LIMIT 10
        `;
    const { rows } = await executeQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener productos mejor calificados:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener usuarios nuevos
app.get('/api/reportes/usuarios-nuevos', verificarToken, esAdmin, async (req, res) => {
  try {
    console.log('Petición recibida para obtener usuarios nuevos');
    const query = `
            SELECT 
                u."idUser",
                u.nombre,
                u.apellidos,
                u.correo,
                u.telf,
                s."Nombre" AS seleccionNombre,
                u."created_at" AS fecha_registro,
                COUNT(DISTINCT p."idPedido") AS num_pedidos
            FROM usuarios AS u
            LEFT JOIN selecciones AS s ON u.seleccion = s."idSelec"
            LEFT JOIN pedidos AS p ON u."idUser" = p.comprador AND p.estado = 'confirmado'
            WHERE u.admin = false
            GROUP BY u."idUser", s."Nombre"
            ORDER BY u."created_at" DESC
            LIMIT 20
        `;
    const { rows } = await executeQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener usuarios nuevos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener usuarios con más pedidos
app.get('/api/reportes/usuarios-mas-pedidos', verificarToken, esAdmin, async (req, res) => {
  try {
    console.log('Petición recibida para obtener usuarios con más pedidos');
    const query = `
            SELECT 
                u."idUser",
                u.nombre,
                u.apellidos,
                u.correo,
                u.telf,
                s."Nombre" AS seleccionNombre,
                COUNT(DISTINCT p."idPedido") AS num_pedidos,
                SUM(p.cantidad) AS total_productos,
                MAX(p."created_at") AS ultimo_pedido
            FROM usuarios AS u
            INNER JOIN pedidos AS p ON u."idUser" = p.comprador
            LEFT JOIN selecciones AS s ON u.seleccion = s."idSelec"
            WHERE u.admin = false AND p.estado = 'confirmado'
            GROUP BY u."idUser", u.nombre, u.apellidos, u.correo, u.telf, s."Nombre"
            HAVING COUNT(DISTINCT p."idPedido") > 0
            ORDER BY num_pedidos DESC, total_productos DESC
            LIMIT 10
        `;
    const { rows } = await executeQuery(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener usuarios con más pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// COMENTARIOS Y CALIFICACIONES DE PRODUCTOS

// Obtener promedio de estrellas de un producto
app.get('/api/productos/:productoId/estrellas', async (req, res) => {
  const { productoId } = req.params;
  try {
    console.log(`Petición recibida para obtener las estrellas del producto con ID: ${productoId}`);
    const { rows } = await executeQuery(
      'SELECT AVG(valoracion) AS promedio, COUNT(valoracion) AS total FROM estrellas WHERE producto = $1',
      [productoId]
    );
    res.json({
      promedio: parseFloat(rows[0].promedio) || 0,
      total: parseInt(rows[0].total) || 0,
    });
  } catch (error) {
    console.error('Error al obtener las estrellas del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener la calificación de un usuario específico para un producto
app.get('/api/productos/:productoId/mi-calificacion', verificarToken, async (req, res) => {
  const { productoId } = req.params;
  const userId = req.user.userId;

  try {
    console.log(`Obteniendo calificación del usuario ${userId} para el producto ${productoId}`);
    const { rows } = await executeQuery(
      'SELECT valoracion FROM estrellas WHERE producto = $1 AND usuario = $2 LIMIT 1',
      [productoId, userId]
    );

    if (rows.length === 0) {
      return res.json({ calificacion: null });
    }

    res.json({ calificacion: rows[0].valoracion });
  } catch (error) {
    console.error('Error al obtener la calificación del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Agregar o actualizar calificación de un usuario para un producto
app.post('/api/productos/:productoId/calificar', verificarToken, async (req, res) => {
  const { productoId } = req.params;
  const { estrellas } = req.body;
  const userId = req.user.userId;

  if (!estrellas || estrellas < 1 || estrellas > 5) {
    return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5 estrellas' });
  }

  try {
    console.log(`Usuario ${userId} calificando producto ${productoId} con ${estrellas} estrellas`);

    // Verificar si el usuario ya tiene una calificación para este producto
    const { rows: calificacionExistente } = await executeQuery(
      'SELECT "idStar" FROM estrellas WHERE producto = $1 AND usuario = $2',
      [productoId, userId]
    );

    if (calificacionExistente.length === 0) {
      // Si no tiene calificación, crear una nueva
      const { rows } = await executeQuery(
        'INSERT INTO estrellas (valoracion, producto, usuario) VALUES ($1, $2, $3) RETURNING *',
        [estrellas, productoId, userId]
      );
      res.status(201).json({
        message: 'Calificación agregada exitosamente',
        calificacion: rows[0],
      });
    } else {
      // Si ya tiene calificación, actualizarla
      const { rows } = await executeQuery(
        'UPDATE estrellas SET valoracion = $1 WHERE "idStar" = $2 RETURNING *',
        [estrellas, calificacionExistente[0].idStar]
      );
      res.json({
        message: 'Calificación actualizada exitosamente',
        calificacion: rows[0],
      });
    }
  } catch (error) {
    console.error('Error al calificar producto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
