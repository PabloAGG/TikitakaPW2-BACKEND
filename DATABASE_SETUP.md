# Sistema de Alternancia de Bases de Datos - TikiTaka

Este sistema permite alternar entre PostgreSQL (Supabase) para producción y MySQL para pruebas usando una simple variable booleana.

## 🚀 Configuración Rápida

### 1. Configurar Variables de Entorno

Asegúrate de que tu archivo `.env` contenga:

```env
# Cambiar a 'true' para usar MySQL, 'false' para Supabase
USE_TEST_DB=false

# PostgreSQL (Supabase) - Producción
DATABASE_URL="postgresql://postgres:pase_PW2tktk@db.syjizpnfpiywmjciyvfk.supabase.co:5432/postgres"

# MySQL - Pruebas
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=tu_password_aqui
MYSQL_DATABASE=tikitaka_test
MYSQL_PORT=3306
```

### 2. Instalar MySQL (si no lo tienes)

- **Windows**: Descarga MySQL desde [mysql.com](https://dev.mysql.com/downloads/mysql/)
- **macOS**: `brew install mysql`
- **Linux**: `sudo apt-get install mysql-server`

### 3. Inicializar Base de Datos MySQL

```bash
# Instalar dependencias si es necesario
npm install

# Crear tablas en MySQL
npm run init-mysql
```

### 4. Probar Conexiones

```bash
# Verificar que ambas bases de datos funcionen
npm run test-connections
```

## 🔄 Cambiar Entre Bases de Datos

### Usar MySQL (Pruebas)
```bash
# Editar .env manualmente y cambiar:
USE_TEST_DB=true
```

### Usar PostgreSQL (Producción)
```bash
# Editar .env manualmente y cambiar:
USE_TEST_DB=false
```

## 📊 Diferencias entre Bases de Datos

| Característica | PostgreSQL (Supabase) | MySQL |
|---|---|---|
| **Uso** | Producción | Pruebas/Desarrollo |
| **Ubicación** | Nube (Supabase) | Local |
| **Sintaxis** | PostgreSQL estándar | MySQL con adaptaciones |
| **RETURNING** | ✅ Soportado | ❌ Simulado |
| **ILIKE** | ✅ Nativo | ✅ Convertido a LIKE |

## 🛠️ Scripts Disponibles

```bash
# Desarrollo normal
npm run dev

# Inicializar MySQL
npm run init-mysql

# Probar conexiones
npm run test-connections

# Producción
npm start
```

## ⚠️ Consideraciones Importantes

1. **Sintaxis SQL**: El sistema convierte automáticamente consultas de PostgreSQL a MySQL
2. **RETURNING**: MySQL no soporta RETURNING, se simula cuando es posible
3. **Nombres de Columnas**: Se adaptan automáticamente entre comillas dobles y backticks
4. **Respaldo**: Siempre mantén respaldos de tu base de datos de producción

## 🧪 Desarrollo y Pruebas

### Para Desarrollo Local
```bash
# 1. Configurar MySQL local
USE_TEST_DB=true

# 2. Inicializar base de datos
npm run init-mysql

# 3. Iniciar servidor
npm run dev
```

### Para Producción
```bash
# 1. Usar Supabase
USE_TEST_DB=false

# 2. Iniciar servidor
npm start
```

## 🐛 Solución de Problemas

### Error de Conexión MySQL
```bash
# Verificar que MySQL esté ejecutándose
mysql -u root -p

# Verificar configuración
npm run test-connections
```

### Error de Sintaxis SQL
- El sistema adapta automáticamente la mayoría de consultas
- Para consultas complejas, verifica los logs del servidor

### RETURNING no Funciona en MySQL
- Es normal, MySQL no soporta RETURNING
- El sistema devuelve un mensaje de éxito en su lugar

## 📁 Estructura de Archivos

```
backend/
├── config/
│   └── database.js          # Configuración de alternancia
├── scripts/
│   ├── initMySQL.js         # Inicialización de MySQL
│   ├── testConnections.js   # Pruebas de conexión
│   └── mysql_init.sql       # Script SQL para MySQL
├── .env                     # Variables de entorno
├── .env.example             # Ejemplo de configuración
└── server.js                # Servidor principal
```