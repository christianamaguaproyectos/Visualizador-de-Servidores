/**
 * Impacto Controller — Impacto de servicios.
 * Delgado: valida la entrada (dtos/impactoDto.js) → delega en impactoService → responde JSON.
 * Todo error va a next(err): el errorHandler nunca expone mensajes crudos de PostgreSQL.
 */

import impactoService from '../services/impactoService.js';
import {
  parseComponenteCambios, parseComponenteNuevo, parseId, parseListaIds, parseRequisitoNuevo,
  parseServicioCambios, parseServicioNuevo, usuarioSesion,
} from '../dtos/impactoDto.js';
import { ValidationError } from '../middleware/errorHandler.js';

/** Envuelve un manejador async: cualquier error va al errorHandler */
const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

class ImpactoController {
  /** GET /api/impacto/servidores — estado de monitoreo de cada servidor */
  servidores = manejar(async (req, res) => {
    res.json({ servers: await impactoService.listarServidores() });
  });

  /** GET /api/impacto — servicios, componentes, requisitos y estado actual */
  panorama = manejar(async (req, res) => {
    res.json(await impactoService.panorama());
  });

  /** GET /api/impacto/simular?ids=1,2 — qué pasaría si cayeran esos servidores */
  simular = manejar(async (req, res) => {
    const ids = parseListaIds(req.query.ids);
    if (!ids.length) throw new ValidationError('Indique al menos un servidor en ids');
    res.json(await impactoService.simular(ids));
  });

  crearServicio = manejar(async (req, res) => {
    res.status(201).json({ service: await impactoService.crearServicio(parseServicioNuevo(req.body), usuarioSesion(req)) });
  });

  editarServicio = manejar(async (req, res) => {
    res.json({ service: await impactoService.editarServicio(parseId(req.params.id), parseServicioCambios(req.body)) });
  });

  eliminarServicio = manejar(async (req, res) => {
    await impactoService.eliminarServicio(parseId(req.params.id));
    res.status(204).end();
  });

  agregarComponente = manejar(async (req, res) => {
    const comp = await impactoService.agregarComponente(parseId(req.params.id), parseComponenteNuevo(req.body), usuarioSesion(req));
    res.status(201).json({ component: comp });
  });

  editarComponente = manejar(async (req, res) => {
    res.json({ component: await impactoService.editarComponente(parseId(req.params.id), parseComponenteCambios(req.body)) });
  });

  eliminarComponente = manejar(async (req, res) => {
    await impactoService.eliminarComponente(parseId(req.params.id));
    res.status(204).end();
  });

  crearRequisito = manejar(async (req, res) => {
    res.status(201).json({ requirement: await impactoService.crearRequisito(parseRequisitoNuevo(req.body), usuarioSesion(req)) });
  });

  eliminarRequisito = manejar(async (req, res) => {
    await impactoService.eliminarRequisito(parseId(req.params.id));
    res.status(204).end();
  });
}

export default new ImpactoController();
