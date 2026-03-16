import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { APP_CONFIG } from '../config/constants.js';
import Logger from '../utils/logger.js';

/**
 * Servicio para gestionar la subida de archivos Excel
 * Configura multer y maneja el almacenamiento de archivos
 */
class UploadService {
  constructor() {
    this.uploadDir = path.resolve(APP_CONFIG.PATHS.UPLOAD_DIR);
    this._ensureUploadDirectory();
    this.upload = this._configureMulter();
  }

  /**
   * Asegura que el directorio de uploads existe
   */
  _ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      Logger.success(`Directorio de uploads creado: ${this.uploadDir}`);
    }
  }

  /**
   * Configura multer para el manejo de archivos
   * @returns {Object} Instancia de multer configurada
   */
  _configureMulter() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.xlsx';
        const filename = `servidores_${Date.now()}${ext}`;
        cb(null, filename);
      }
    });

    return multer({ storage });
  }

  /**
   * Obtiene el middleware de multer para usar en rutas
   * @returns {Function} Middleware de multer
   */
  getMulterMiddleware() {
    return this.upload.single('excel');
  }
}

export default new UploadService();
