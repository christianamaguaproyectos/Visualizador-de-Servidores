import { withClient } from '../config/db.js';
import Logger from '../utils/logger.js';

class ClusterController {
  async getAllClusters(req, res) {
    try {
      await withClient(async (client) => {
        const result = await client.query(
          'SELECT * FROM inventory.virtual_clusters ORDER BY display_order, name'
        );
        res.json(result.rows);
      });
    } catch (error) {
      Logger.error('Error obteniendo clusters:', error);
      res.status(500).json({ error: 'Error obteniendo clusters', details: error.message });
    }
  }

  async getClusterById(req, res) {
    try {
      const { id } = req.params;
      await withClient(async (client) => {
        const result = await client.query(
          'SELECT * FROM inventory.virtual_clusters WHERE id = $1',
          [id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Cluster no encontrado' });
        }
        res.json(result.rows[0]);
      });
    } catch (error) {
      Logger.error('Error obteniendo cluster:', error);
      res.status(500).json({ error: 'Error obteniendo cluster', details: error.message });
    }
  }

  async createCluster(req, res) {
    try {
      const { name, key, description, type, display_order } = req.body;

      if (!name || !key) {
        return res.status(400).json({ error: 'Campos requeridos: name, key' });
      }

      await withClient(async (client) => {
        try {
          const result = await client.query(
            `INSERT INTO inventory.virtual_clusters (name, key, description, type, display_order)
             VALUES ($1, $2, $3, COALESCE($4, 'cluster'), COALESCE($5, 0))
             RETURNING *`,
            [name, key, description || null, type || 'cluster', display_order ?? 0]
          );
          Logger.success(`Cluster creado: ${name} (${key})`);
          res.status(201).json(result.rows[0]);
        } catch (error) {
          if (error.code === '23505') {
            return res.status(409).json({ error: 'Nombre o key de cluster ya existen' });
          }
          throw error;
        }
      });
    } catch (error) {
      Logger.error('Error creando cluster:', error);
      res.status(500).json({ error: 'Error creando cluster', details: error.message });
    }
  }

  async updateCluster(req, res) {
    try {
      const { id } = req.params;
      const { name, key, description, type, display_order } = req.body;

      await withClient(async (client) => {
        try {
          const result = await client.query(
            `UPDATE inventory.virtual_clusters
             SET name = COALESCE($1, name),
                 key = COALESCE($2, key),
                 description = COALESCE($3, description),
                 type = COALESCE($4, type),
                 display_order = COALESCE($5, display_order),
                 updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [name ?? null, key ?? null, description ?? null, type ?? null, display_order, id]
          );

          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cluster no encontrado' });
          }

          Logger.success(`Cluster actualizado: ${result.rows[0].name} (ID: ${id})`);
          res.json(result.rows[0]);
        } catch (error) {
          if (error.code === '23505') {
            return res.status(409).json({ error: 'Nombre o key de cluster ya existen' });
          }
          throw error;
        }
      });
    } catch (error) {
      Logger.error('Error actualizando cluster:', error);
      res.status(500).json({ error: 'Error actualizando cluster', details: error.message });
    }
  }

  async deleteCluster(req, res) {
    try {
      const { id } = req.params;
      await withClient(async (client) => {
        const result = await client.query(
          'DELETE FROM inventory.virtual_clusters WHERE id = $1 RETURNING name',
          [id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Cluster no encontrado' });
        }

        Logger.success(`Cluster eliminado: ${result.rows[0].name} (ID: ${id})`);
        res.json({ ok: true, message: 'Cluster eliminado exitosamente' });
      });
    } catch (error) {
      Logger.error('Error eliminando cluster:', error);
      res.status(500).json({ error: 'Error eliminando cluster', details: error.message });
    }
  }

  async getClusterHosts(req, res) {
    try {
      const { id } = req.params;
      await withClient(async (client) => {
        const result = await client.query(
          `SELECT ch.id,
                  ch.cluster_id,
                  ch.rack_id,
                  r.name AS rack_name
           FROM inventory.cluster_hosts ch
           JOIN inventory.racks r ON r.id = ch.rack_id
           WHERE ch.cluster_id = $1
           ORDER BY r.name`,
          [id]
        );
        res.json(result.rows);
      });
    } catch (error) {
      Logger.error('Error obteniendo hosts de cluster:', error);
      res.status(500).json({ error: 'Error obteniendo hosts de cluster', details: error.message });
    }
  }

  async addHostToCluster(req, res) {
    try {
      const { id } = req.params;
      const { rack_id } = req.body;

      if (!rack_id) {
        return res.status(400).json({ error: 'Campo requerido: rack_id' });
      }

      await withClient(async (client) => {
        const result = await client.query(
          `INSERT INTO inventory.cluster_hosts (cluster_id, rack_id)
           VALUES ($1, $2)
           ON CONFLICT (cluster_id, rack_id) DO NOTHING
           RETURNING *`,
          [id, rack_id]
        );
        res.status(201).json(result.rows[0] || null);
      });
    } catch (error) {
      Logger.error('Error agregando host a cluster:', error);
      res.status(500).json({ error: 'Error agregando host a cluster', details: error.message });
    }
  }

  async removeHostFromCluster(req, res) {
    try {
      const { id, rackId } = req.params;
      await withClient(async (client) => {
        const result = await client.query(
          'DELETE FROM inventory.cluster_hosts WHERE cluster_id = $1 AND rack_id = $2 RETURNING id',
          [id, rackId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Relación cluster-host no encontrada' });
        }

        res.json({ ok: true, message: 'Host removido del cluster' });
      });
    } catch (error) {
      Logger.error('Error removiendo host de cluster:', error);
      res.status(500).json({ error: 'Error removiendo host de cluster', details: error.message });
    }
  }
}

export default new ClusterController();
