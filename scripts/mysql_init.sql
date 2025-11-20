-- scripts/mysql_init.sql
-- Script para crear las tablas necesarias en MySQL para TikiTaka
-- Compatible con MySQL Workbench

-- Crear base de datos si no existe
CREATE DATABASE IF NOT EXISTS tikitaka_test;
USE tikitaka_test;

-- Configurar MySQL para mejor compatibilidad
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";

-- Tabla de selecciones
CREATE TABLE IF NOT EXISTS `selecciones` (
  `idSelec` BIGINT NOT NULL AUTO_INCREMENT,
  `Nombre` VARCHAR(255) NOT NULL,
  `Datos` TEXT NOT NULL,
  PRIMARY KEY (`idSelec`),
  UNIQUE KEY `Selecciones_Nombre_key` (`Nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
  `idUser` BIGINT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(255) NOT NULL,
  `apellidos` VARCHAR(255) NOT NULL,
  `correo` VARCHAR(255) NOT NULL,
  `telf` VARCHAR(255) NOT NULL,
  `contraseña` VARCHAR(255) NOT NULL,
  `seleccion` BIGINT NOT NULL,
  `admin` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idUser`),
  UNIQUE KEY `usuarios_correo_unique` (`correo`),
  KEY `Usuarios_seleccion_fkey` (`seleccion`),
  CONSTRAINT `Usuarios_seleccion_fkey` FOREIGN KEY (`seleccion`) REFERENCES `selecciones` (`idSelec`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de productos
CREATE TABLE IF NOT EXISTS `producto` (
  `idProduct` BIGINT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(255) NOT NULL,
  `descripcion` TEXT NOT NULL,
  `seleccion` BIGINT NOT NULL,
  `genero` VARCHAR(20) NOT NULL,
  `top` BOOLEAN NOT NULL DEFAULT FALSE,
  `activo` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idProduct`),
  KEY `Producto_seleccion_fkey` (`seleccion`),
  CONSTRAINT `Producto_seleccion_fkey` FOREIGN KEY (`seleccion`) REFERENCES `selecciones` (`idSelec`),
  CONSTRAINT `chk_genero` CHECK (`genero` IN ('masculino', 'femenino', 'unisex'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS `pedidos` (
  `idPedido` BIGINT NOT NULL AUTO_INCREMENT,
  `producto` BIGINT NOT NULL,
  `cantidad` BIGINT NOT NULL,
  `comprador` BIGINT NULL,
  `estado` VARCHAR(50) DEFAULT 'pendiente',
  `estrellas` INT NULL CHECK (`estrellas` >= 1 AND `estrellas` <= 5),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idPedido`),
  KEY `Pedidos_comprador_fkey` (`comprador`),
  KEY `Pedidos_producto_fkey` (`producto`),
  CONSTRAINT `Pedidos_comprador_fkey` FOREIGN KEY (`comprador`) REFERENCES `usuarios` (`idUser`),
  CONSTRAINT `Pedidos_producto_fkey` FOREIGN KEY (`producto`) REFERENCES `producto` (`idProduct`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de multimedia
CREATE TABLE IF NOT EXISTS `multimedia` (
  `idmulti` INT NOT NULL AUTO_INCREMENT,
  `producto` INT NOT NULL,
  `url` TEXT NOT NULL,
  `tipo` VARCHAR(20) DEFAULT 'image',
  `fecha_subida` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idmulti`),
  KEY `idx_multimedia_producto` (`producto`),
  KEY `idx_multimedia_tipo` (`tipo`),
  CONSTRAINT `multimedia_producto_fkey` FOREIGN KEY (`producto`) REFERENCES `producto` (`idProduct`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de estrellas (comentarios con valoración)
CREATE TABLE IF NOT EXISTS `estrellas` (
  `idStar` BIGINT NOT NULL AUTO_INCREMENT,
  `valoracion` BIGINT NOT NULL,
  `producto` BIGINT NOT NULL,
  `usuario` BIGINT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idStar`),
  KEY `Estrellas_producto_fkey` (`producto`),
  KEY `Estrellas_usuario_fkey` (`usuario`),
  CONSTRAINT `Estrellas_producto_fkey` FOREIGN KEY (`producto`) REFERENCES `producto` (`idProduct`),
  CONSTRAINT `Estrellas_usuario_fkey` FOREIGN KEY (`usuario`) REFERENCES `usuarios` (`idUser`),
  CONSTRAINT `chk_valoracion` CHECK (`valoracion` >= 1 AND `valoracion` <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de comentarios
CREATE TABLE IF NOT EXISTS `comentarios` (
  `idComent` BIGINT NOT NULL AUTO_INCREMENT,
  `contenido` TEXT NOT NULL,
  `usuario` BIGINT NOT NULL,
  `producto` BIGINT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idComent`),
  KEY `Comentarios_producto_fkey` (`producto`),
  KEY `Comentarios_usuario_fkey` (`usuario`),
  CONSTRAINT `Comentarios_producto_fkey` FOREIGN KEY (`producto`) REFERENCES `producto` (`idProduct`),
  CONSTRAINT `Comentarios_usuario_fkey` FOREIGN KEY (`usuario`) REFERENCES `usuarios` (`idUser`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Datos de ejemplo para selecciones (equipos de fútbol)
INSERT INTO `selecciones` (`Nombre`, `Datos`) VALUES
('México', 'Anfitrión. Ránking FIFA: 13. Títulos de Copa Oro: 12. Máximo goleador: Javier Hernández (52). Más participaciones: Andrés Guardado (180). Mejor resultado en Mundial: Cuartos de final (1970, 1986).'),
('Canadá', 'Anfitrión. Ránking FIFA: 28. Títulos de Copa Oro: 2. Máximo goleador: Cyle Larin (28). Más participaciones: Atiba Hutchinson (105). Mejor resultado en Mundial: Fase de grupos (1986, 2022).'),
('Estados Unidos', 'Anfitrión. Ránking FIFA: 16. Títulos de Copa Oro: 7. Máximo goleador: Clint Dempsey, Landon Donovan (57). Más participaciones: Cobi Jones (164). Mejor resultado en Mundial: Tercer lugar (1930).'),
('Japón', 'Ránking FIFA: 15. Títulos de Copa Asiática: 4. Máximo goleador: Kunishige Kamamoto (75). Más participaciones: Yasuhito Endō (152). Mejor resultado en Mundial: Octavos de final (2002, 2010, 2018, 2022).'),
('Irán', 'Ránking FIFA: 20. Títulos de Copa Asiática: 3. Máximo goleador: Ali Daei (109). Más participaciones: Javad Nekounam (151). Mejor resultado en Mundial: Fase de grupos.'),
('Corea del Sur', 'Ránking FIFA: 23. Títulos de Copa Asiática: 2. Máximo goleador: Cha Bum-kun (58). Más participaciones: Hong Myung-bo (136). Mejor resultado en Mundial: Cuarto lugar (2002).'),
('Australia', 'Ránking FIFA: 24. Títulos de Copa Asiática: 1. Máximo goleador: Tim Cahill (50). Más participaciones: Mark Schwarzer (109). Mejor resultado en Mundial: Octavos de final (2006).'),
('Nueva Zelanda', 'Ránking FIFA: 86. Títulos de Copa de las Naciones de la OFC: 5. Máximo goleador: Vaughan Coveny (28). Más participaciones: Ivan Vicelich (88). Mejor resultado en Mundial: Fase de grupos (1982, 2010).'),
('Argentina', 'Ránking FIFA: 1. Títulos de Copa del Mundo: 3. Máximo goleador: Lionel Messi (106). Más participaciones: Lionel Messi (178). Campeón defensor del Mundo.'),
('Brasil', 'Ránking FIFA: 5. Títulos de Copa del Mundo: 5. Máximo goleador: Neymar (79). Más participaciones: Cafu (142). Única selección en participar en todos los mundiales.'),
('Uruguay', 'Ránking FIFA: 13. Títulos de Copa del Mundo: 2. Máximo goleador: Luis Suárez (68). Más participaciones: Diego Godín (161). Primer campeón de la Copa del Mundo.'),
('Colombia', 'Ránking FIFA: 17. Mejor resultado en Copa del Mundo: Cuartos de final (2014). Máximo goleador: Radamel Falcao (36). Más participaciones: David Ospina (128).'),
('Ecuador', 'Ránking FIFA: 30. Mejor resultado en Copa del Mundo: Octavos de final (2006). Máximo goleador: Enner Valencia (40). Más participaciones: Iván Hurtado (168).'),
('Paraguay', 'Ránking FIFA: 48. Mejor resultado en Copa del Mundo: Cuartos de final (2010). Máximo goleador: Roque Santa Cruz (32). Más participaciones: Paulo da Silva (150).'),
('Marruecos', 'Ránking FIFA: 11. Mejor resultado en Copa del Mundo: Cuarto lugar (2022). Máximo goleador: Ahmed Faras (36). Más participaciones: Noureddine Naybet (115).'),
('Jordania', 'Ránking FIFA: 70. Nunca ha clasificado a un Mundial. Subcampeón de la Copa Asiática 2023. Máximo goleador: Hamza Al-Dardour (35).'),
('Uzbekistán', 'Ránking FIFA: 57. Nunca ha clasificado a un Mundial. Máximo goleador: Eldor Shomurodov (37). Más participaciones: Server Djeparov (128).');

-- Usuario administrador de ejemplo (contraseña: admin123)
INSERT INTO `usuarios` (`nombre`, `apellidos`, `correo`, `telf`, `contraseña`, `seleccion`, `admin`) VALUES
('Admin', 'TikiTaka', 'admin@tikitaka.com', '123456789', '$2b$10$K9YwzX7QkVf8gQkRFsyDKOqkgZ.NzKh7gQwGhHZ8JGFOlQhE6kXYG', 1, TRUE);

-- Productos de ejemplo
INSERT INTO `producto` (`nombre`, `descripcion`, `seleccion`, `genero`, `top`, `activo`) VALUES
('Camiseta México Local 2026', 'Camiseta oficial de la selección mexicana para el Mundial 2026', 1, 'unisex', TRUE, TRUE),
('Jersey Argentina Campeón', 'Camiseta conmemorativa del campeonato mundial de Argentina', 9, 'unisex', TRUE, TRUE),
('Playera Brasil Clásica', 'Jersey clásico de la selección brasileña', 10, 'masculino', FALSE, TRUE);

-- Finalizar transacción
COMMIT;

-- Mostrar resumen de tablas creadas
SELECT 'Tablas creadas exitosamente en MySQL para TikiTaka' AS mensaje;
SHOW TABLES;

-- Mostrar conteo de datos insertados
SELECT 
    (SELECT COUNT(*) FROM selecciones) as selecciones_count,
    (SELECT COUNT(*) FROM usuarios) as usuarios_count,
    (SELECT COUNT(*) FROM producto) as productos_count;