-- scripts/mysql_init.sql
-- Script para crear las tablas necesarias en MySQL para TikiTaka

-- Crear base de datos si no existe
CREATE DATABASE IF NOT EXISTS tikitaka_test;
USE tikitaka_test;

-- Tabla de selecciones
CREATE TABLE IF NOT EXISTS selecciones (
    `idSelec` INT AUTO_INCREMENT PRIMARY KEY,
    `Nombre` VARCHAR(255) NOT NULL,
    `datos` TEXT
);

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    `idUser` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(255) NOT NULL,
    `apellidos` VARCHAR(255) NOT NULL,
    `correo` VARCHAR(255) UNIQUE NOT NULL,
    `telf` VARCHAR(20),
    `contraseña` VARCHAR(255) NOT NULL,
    `seleccion` INT,
    `admin` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`seleccion`) REFERENCES selecciones(`idSelec`)
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS producto (
    `idProduct` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(255) NOT NULL,
    `descripcion` TEXT,
    `seleccion` INT,
    `genero` VARCHAR(50),
    `top` BOOLEAN DEFAULT FALSE,
    `activo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`seleccion`) REFERENCES selecciones(`idSelec`)
);

-- Tabla de multimedia
CREATE TABLE IF NOT EXISTS multimedia (
    `idmulti` INT AUTO_INCREMENT PRIMARY KEY,
    `producto` INT NOT NULL,
    `url` TEXT NOT NULL,
    `tipo` VARCHAR(50) DEFAULT 'image',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`producto`) REFERENCES producto(`idProduct`) ON DELETE CASCADE
);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    `idPedido` INT AUTO_INCREMENT PRIMARY KEY,
    `producto` INT NOT NULL,
    `cantidad` INT DEFAULT 1,
    `comprador` INT NOT NULL,
    `estado` VARCHAR(50) DEFAULT 'pendiente',
    `estrellas` INT DEFAULT NULL CHECK (estrellas >= 1 AND estrellas <= 5),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`producto`) REFERENCES producto(`idProduct`),
    FOREIGN KEY (`comprador`) REFERENCES usuarios(`idUser`)
);

-- Insertar datos de ejemplo para selecciones
INSERT IGNORE INTO selecciones (`idSelec`, `Nombre`, `datos`) VALUES
(1, 'Deportes', ''),
(2, 'Fútbol', ''),
(3, 'Perfumes', ''),
(4, 'Moda', ''),
(5, 'Electrónicos', '');

-- Insertar usuario administrador de ejemplo
INSERT IGNORE INTO usuarios (`nombre`, `apellidos`, `correo`, `telf`, `contraseña`, `seleccion`, `admin`) VALUES
('Admin', 'TikiTaka', 'admin@tikitaka.com', '123456789', '$2b$10$example.hash.here', 1, TRUE);

COMMIT;

-- Mostrar las tablas creadas
SHOW TABLES;

SELECT 'Base de datos MySQL inicializada exitosamente para TikiTaka' AS mensaje;