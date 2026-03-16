import { withClient } from '../config/db.js';
import sseService from '../services/sseService.js';
import Logger from '../utils/logger.js';

/**
 * Controlador para gestión de racks
 */
class RackController {
  /**
   * Crea un nuevo rack
   * POST /api/racks
   */
  async createRack(req, res) {
    try {
      const { name, raw_name, type } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Campo requerido: name' });
      }

      // Tipo por defecto es 'fisicos' si no se especifica
      const rackType = type || 'fisicos';

      await withClient(async (client) => {
        const result = await client.query(
          'INSERT INTO inventory.racks(name, raw_name, type) VALUES($1, $2, $3) RETURNING id, name',
          [name, raw_name || name, rackType]
        );

        Logger.success(`Rack creado: ${name} tipo=${rackType} (ID: ${result.rows[0].id})`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        res.status(201).json({
          ok: true,
          id: result.rows[0].id,
          name: result.rows[0].name,
          type: rackType,
          message: 'Rack creado exitosamente'
        });
      });
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Ya existe un rack con ese nombre en este tipo' });
      }
      Logger.error('Error creando rack:', error);
      res.status(500).json({ error: 'Error creando rack', details: error.message });
    }
  }

  /**
   * Actualiza un rack existente
   * PUT /api/racks/:id
   */
  async updateRack(req, res) {
    try {
      const { id } = req.params;
      const { name, raw_name } = req.body;

      if (!name && !raw_name) {
        return res.status(400).json({ error: 'Debe proporcionar al menos un campo para actualizar' });
      }

      await withClient(async (client) => {
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
          updates.push(`name = $${paramCount}`);
          values.push(name);
          paramCount++;
        }

        if (raw_name) {
          updates.push(`raw_name = $${paramCount}`);
          values.push(raw_name);
          paramCount++;
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        const result = await client.query(
          `UPDATE inventory.racks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING name`,
          values
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Rack no encontrado' });
        }

        Logger.success(`Rack actualizado: ${result.rows[0].name} (ID: ${id})`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        res.json({ ok: true, message: 'Rack actualizado exitosamente' });
      });
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Ya existe un rack con ese nombre' });
      }
      Logger.error('Error actualizando rack:', error);
      res.status(500).json({ error: 'Error actualizando rack', details: error.message });
    }
  }

  /**
   * Elimina un rack (solo si no tiene servidores)
   * DELETE /api/racks/:id
   */
  async deleteRack(req, res) {
    try {
      const { id } = req.params;
      const { force } = req.query; // ?force=true para eliminar con servidores

      await withClient(async (client) => {
        // Verificar si tiene servidores
        const serverCount = await client.query(
          'SELECT COUNT(*)::int as count FROM inventory.servers WHERE rack_id = $1',
          [id]
        );

        if (serverCount.rows[0].count > 0 && force !== 'true') {
          return res.status(400).json({
            error: 'El rack contiene servidores',
            serverCount: serverCount.rows[0].count,
            message: 'Use ?force=true para eliminar de todas formas (se eliminarán todos los servidores del rack)'
          });
        }

        // Si force=true, eliminar servidores primero
        if (force === 'true' && serverCount.rows[0].count > 0) {
          await client.query(
            'DELETE FROM inventory.servers WHERE rack_id = $1',
            [id]
          );
          Logger.info(`${serverCount.rows[0].count} servidores eliminados del rack`);
        }

        // Eliminar rack
        const result = await client.query('DELETE FROM inventory.racks WHERE id = $1 RETURNING name', [id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Rack no encontrado' });
        }

        Logger.success(`Rack eliminado: ${result.rows[0].name} (ID: ${id})`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        res.json({ ok: true, message: 'Rack eliminado exitosamente' });
      });
    } catch (error) {
      Logger.error('Error eliminando rack:', error);
      res.status(500).json({ error: 'Error eliminando rack', details: error.message });
    }
  }

  /**
   * Elimina un rack por nombre (solo si no tiene servidores)
   * DELETE /api/racks/by-name/:name
   */
  async deleteRackByName(req, res) {
    try {
      const { name } = req.params;
      const { force } = req.query; // ?force=true para eliminar con servidores

      await withClient(async (client) => {
        // Buscar rack por nombre
        const rackResult = await client.query(
          'SELECT id, name FROM inventory.racks WHERE name = $1',
          [decodeURIComponent(name)]
        );

        if (rackResult.rows.length === 0) {
          return res.status(404).json({ error: 'Rack no encontrado' });
        }

        const rack = rackResult.rows[0];

        // Verificar si tiene servidores
        const serverCount = await client.query(
          'SELECT COUNT(*)::int as count FROM inventory.servers WHERE rack_id = $1',
          [rack.id]
        );

        if (serverCount.rows[0].count > 0 && force !== 'true') {
          return res.status(400).json({
            error: 'El rack contiene servidores',
            serverCount: serverCount.rows[0].count,
            message: 'Use ?force=true para eliminar de todas formas (se eliminarán todos los servidores del rack)'
          });
        }

        // Si force=true, eliminar servidores primero
        if (force === 'true' && serverCount.rows[0].count > 0) {
          await client.query(
            'DELETE FROM inventory.servers WHERE rack_id = $1',
            [rack.id]
          );
          Logger.info(`${serverCount.rows[0].count} servidores eliminados del rack ${rack.name}`);
        }

        // Eliminar rack
        await client.query('DELETE FROM inventory.racks WHERE id = $1', [rack.id]);

        Logger.success(`Rack eliminado: ${rack.name} (ID: ${rack.id})`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        res.json({ ok: true, message: 'Rack eliminado exitosamente' });
      });
    } catch (error) {
      Logger.error('Error eliminando rack:', error);
      res.status(500).json({ error: 'Error eliminando rack', details: error.message });
    }
  }

  /**
   * Obtiene detalles de un rack con sus servidores
   * GET /api/racks/:id
   */
  async getRackDetails(req, res) {
    try {
      const { id } = req.params;

      await withClient(async (client) => {
        const rack = await client.query('SELECT * FROM inventory.racks WHERE id = $1', [id]);

        if (rack.rows.length === 0) {
          return res.status(404).json({ error: 'Rack no encontrado' });
        }

        const servers = await client.query(
          'SELECT * FROM inventory.servers WHERE rack_id = $1 ORDER BY nombre ASC',
          [id]
        );

        res.json({
          rack: rack.rows[0],
          servers: servers.rows,
          serverCount: servers.rows.length
        });
      });
    } catch (error) {
      Logger.error('Error obteniendo rack:', error);
      res.status(500).json({ error: 'Error obteniendo rack', details: error.message });
    }
  }
}

export default new RackController();
