/**
 * NotificationService - Servicio de notificaciones por Email y Microsoft Teams
 * Envía alertas cuando hay cambios de estado en hosts o incidentes
 */
import nodemailer from 'nodemailer';
import monitoringConfig from '../config/monitoringConfig.js';
import Logger from '../../utils/logger.js';

/**
 * Formatea una fecha con la zona horaria de Ecuador (UTC-5)
 * @param {Date} date - Fecha a formatear (default: now)
 * @returns {string} Fecha formateada en español de Ecuador
 */
function formatDateEcuador(date = new Date()) {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

class NotificationService {
  constructor() {
    this.transporter = null;
    this.lastNotifications = new Map(); // hostId -> { timestamp, type }
    this.coolingPeriodMs = 10 * 60 * 1000; // 10 minutos entre alertas del mismo host
    this.initialized = false;
  }

  /**
   * Inicializa el transportador de email
   */
  initialize() {
    if (this.initialized) return;

    const { smtp } = monitoringConfig;
    if (smtp.host && smtp.user && smtp.pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port || 587,
          secure: smtp.port === 465,
          auth: {
            user: smtp.user,
            pass: smtp.pass
          },
          tls: {
            rejectUnauthorized: false // Para servidores internos
          }
        });
        Logger.success('📧 NotificationService: Transporter de email configurado');
      } catch (err) {
        Logger.error('Error configurando transporter de email:', err.message);
      }
    } else {
      Logger.warn('📧 NotificationService: SMTP no configurado (variables SMTP_* vacías)');
    }

    this.initialized = true;
  }

  /**
   * Verifica si se puede enviar notificación (cooling period)
   */
  canNotify(hostId, type) {
    const key = `${hostId}-${type}`;
    const last = this.lastNotifications.get(key);
    if (!last) return true;

    const elapsed = Date.now() - last.timestamp;
    return elapsed >= this.coolingPeriodMs;
  }

  /**
   * Registra que se envió una notificación
   */
  markNotified(hostId, type) {
    const key = `${hostId}-${type}`;
    this.lastNotifications.set(key, { timestamp: Date.now(), type });
  }

  /**
   * Envía notificación por email
   */
  async sendEmail({ to, subject, html, text }) {
    this.initialize();

    if (!this.transporter) {
      Logger.warn('📧 Email no enviado: SMTP no configurado');
      return { success: false, reason: 'SMTP not configured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: monitoringConfig.smtp.user,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text
      });
      Logger.success(`📧 Email enviado: ${subject} -> ${to}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      Logger.error('📧 Error enviando email:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Envía notificación a Microsoft Teams via Webhook
   */
  async sendTeams({ title, text, color = 'FF0000', facts = [] }) {
    const webhookUrl = monitoringConfig.teamsWebhookUrl;
    if (!webhookUrl) {
      Logger.warn('📢 Teams no enviado: TEAMS_WEBHOOK_URL no configurado');
      return { success: false, reason: 'Teams webhook not configured' };
    }

    // Adaptive Card format para Teams
    const card = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: color,
      summary: title,
      sections: [{
        activityTitle: title,
        activitySubtitle: formatDateEcuador(),
        facts: facts.map(f => ({ name: f.name, value: f.value })),
        text: text,
        markdown: true
      }]
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card)
      });

      if (response.ok) {
        Logger.success(`📢 Teams notificado: ${title}`);
        return { success: true };
      } else {
        const errorText = await response.text();
        Logger.error('📢 Error Teams:', errorText);
        return { success: false, error: errorText };
      }
    } catch (err) {
      Logger.error('📢 Error enviando a Teams:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Genera HTML para email de alerta
   */
  generateAlertEmailHtml({ host, incident, prevState, newState }) {
    const isDown = newState === 'DOWN';
    const isRecovery = newState === 'UP' && (prevState === 'DOWN' || prevState === 'DEGRADED');
    const bgColor = isDown ? '#ef4444' : isRecovery ? '#22c55e' : '#f59e0b';
    const statusIcon = isDown ? '🔴' : isRecovery ? '🟢' : '🟡';
    const statusText = isDown ? 'CAÍDO' : isRecovery ? 'RECUPERADO' : 'DEGRADADO';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: ${bgColor}; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header .icon { font-size: 48px; }
    .content { padding: 24px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .info-item { background: #f9fafb; padding: 12px; border-radius: 8px; }
    .info-item label { font-size: 12px; color: #6b7280; text-transform: uppercase; display: block; margin-bottom: 4px; }
    .info-item value { font-size: 16px; font-weight: 600; color: #111827; }
    .timeline { border-left: 3px solid ${bgColor}; padding-left: 16px; margin: 20px 0; }
    .timeline-item { margin-bottom: 12px; }
    .timeline-time { font-size: 12px; color: #6b7280; }
    .footer { background: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #6b7280; }
    .btn { display: inline-block; background: ${bgColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">${statusIcon}</div>
      <h1>Host ${statusText}</h1>
    </div>
    <div class="content">
      <div class="info-grid">
        <div class="info-item">
          <label>Hostname</label>
          <value>${host.name || 'N/A'}</value>
        </div>
        <div class="info-item">
          <label>IP</label>
          <value>${host.ip || 'N/A'}</value>
        </div>
        <div class="info-item">
          <label>Estado Anterior</label>
          <value>${prevState || 'N/A'}</value>
        </div>
        <div class="info-item">
          <label>Estado Actual</label>
          <value>${newState}</value>
        </div>
        <div class="info-item">
          <label>Tipo</label>
          <value>${host.type || 'N/A'}</value>
        </div>
        <div class="info-item">
          <label>Rack</label>
          <value>${host.rack || 'N/A'}</value>
        </div>
      </div>
      
      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-time">${formatDateEcuador()}</div>
          <div>Cambio de estado detectado: ${prevState} → ${newState}</div>
        </div>
        ${incident ? `
        <div class="timeline-item">
          <div class="timeline-time">${incident.opened_at ? formatDateEcuador(new Date(incident.opened_at)) : 'N/A'}</div>
          <div>Incidente abierto - Severidad: ${incident.severity}</div>
        </div>
        ` : ''}
      </div>
      
      <center>
        <a href="${process.env.APP_URL || 'http://localhost:3050'}/monitoring.html" class="btn">Ver Dashboard de Monitoreo</a>
      </center>
    </div>
    <div class="footer">
      Sistema de Monitoreo de Servidores - Grupo Danec<br>
      Este es un mensaje automático, no responder.
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Obtiene los destinatarios de alertas desde la base de datos
   */
  async getAlertRecipients(notificationType) {
    try {
      const { withMonitoringClient } = await import('../config/monitoringDb.js');

      return await withMonitoringClient(async (client) => {
        await client.query('SET search_path TO monitoring, public');

        // Filtrar por tipo de notificación
        let condition = 'enabled = true';
        if (notificationType === 'down') {
          condition += ' AND notify_down = true';
        } else if (notificationType === 'degraded') {
          condition += ' AND notify_degraded = true';
        } else if (notificationType === 'recovery') {
          condition += ' AND notify_recovery = true';
        }

        const { rows } = await client.query(`
          SELECT email FROM alert_recipients WHERE ${condition}
        `);

        return rows.map(r => r.email);
      });
    } catch (err) {
      Logger.error('Error obteniendo destinatarios de BD:', err.message);
      // Fallback a variable de entorno si hay error
      const fallback = process.env.ALERT_EMAIL_TO;
      return fallback ? fallback.split(',').map(e => e.trim()) : [];
    }
  }

  /**
   * Notifica cambio de estado de un host
   * Acepta dos formatos:
   * 1. { host: {id, name, ip...}, prevState, newState, incident }
   * 2. { hostId, hostName, hostIp, previousState, newState, isCritical, error, checkType }
   */
  async notifyStateChange(params) {
    // Normalizar parámetros (soportar ambos formatos)
    let host, prevState, newState, incident;

    if (params.host) {
      // Formato original del scheduler
      host = params.host;
      prevState = params.prevState;
      newState = params.newState;
      incident = params.incident;
    } else {
      // Formato del simulador
      host = {
        id: params.hostId,
        name: params.hostName,
        ip: params.hostIp,
        critical: params.isCritical,
        type: 'N/A',
        rack: 'N/A'
      };
      prevState = params.previousState;
      newState = params.newState;
      incident = null;
    }

    // Verificar cooling period
    const notificationType = newState === 'UP' ? 'recovery' : 'alert';
    if (!this.canNotify(host.id, notificationType)) {
      Logger.debug(`📧 Notificación suprimida por cooling period: Host ${host.name}`);
      return { suppressed: true };
    }

    const isDown = newState === 'DOWN';
    const isRecovery = newState === 'UP';
    const isDegraded = newState === 'DEGRADED';

    const results = { email: null, teams: null };

    // Construir mensaje
    const statusEmoji = isDown ? '🔴' : isRecovery ? '🟢' : '🟡';
    const statusText = isDown ? 'CAÍDO' : isRecovery ? 'RECUPERADO' : 'DEGRADADO';
    const subject = `${statusEmoji} [${statusText}] ${host.name} (${host.ip})`;

    // Obtener destinatarios según el tipo de notificación
    const dbNotifyType = isDown ? 'down' : (isDegraded ? 'degraded' : 'recovery');
    const recipients = await this.getAlertRecipients(dbNotifyType);

    if (recipients.length > 0) {
      const html = this.generateAlertEmailHtml({ host, incident, prevState, newState });
      results.email = await this.sendEmail({
        to: recipients,
        subject,
        html,
        text: `Host ${host.name} (${host.ip}) cambió de ${prevState} a ${newState}`
      });
    } else {
      Logger.warn('📧 No hay destinatarios configurados para alertas');
    }

    // Enviar a Teams
    const teamsColor = isDown ? 'FF0000' : isRecovery ? '00FF00' : 'FFA500';
    results.teams = await this.sendTeams({
      title: subject,
      text: `El host ha cambiado su estado de **${prevState}** a **${newState}**`,
      color: teamsColor,
      facts: [
        { name: 'Hostname', value: host.name || 'N/A' },
        { name: 'IP', value: host.ip || 'N/A' },
        { name: 'Tipo', value: host.type || 'N/A' },
        { name: 'Rack', value: host.rack || 'N/A' },
        { name: 'Hora', value: formatDateEcuador() }
      ]
    });

    // Marcar como notificado
    this.markNotified(host.id, notificationType);

    Logger.info(`📧 Notificaciones enviadas para ${host.name}: Email=${results.email?.success}, Teams=${results.teams?.success}`);
    return results;
  }

  /**
   * Notifica apertura de incidente
   */
  async notifyIncidentOpened(incident, host) {
    return this.notifyStateChange({
      host,
      prevState: 'UP',
      newState: incident.severity === 'critical' ? 'DOWN' : 'DEGRADED',
      incident
    });
  }

  /**
   * Notifica cierre de incidente
   */
  async notifyIncidentClosed(incident, host) {
    return this.notifyStateChange({
      host,
      prevState: incident.severity === 'critical' ? 'DOWN' : 'DEGRADED',
      newState: 'UP',
      incident
    });
  }

  /**
   * Envía resumen diario de estado
   */
  async sendDailySummary({ hostsUp, hostsDown, hostsDegraded, incidents }) {
    const subject = `📊 Resumen Diario de Monitoreo - ${formatDateEcuador().split(',')[0]}`;
    const total = hostsUp + hostsDown + hostsDegraded;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat { background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; flex: 1; }
    .stat.up { border-left: 4px solid #22c55e; }
    .stat.down { border-left: 4px solid #ef4444; }
    .stat.degraded { border-left: 4px solid #f59e0b; }
    .stat .number { font-size: 32px; font-weight: bold; }
    .stat .label { color: #6b7280; }
  </style>
</head>
<body>
  <h1>📊 Resumen Diario de Monitoreo</h1>
  <p>Estado de los servidores al ${formatDateEcuador()}</p>
  
  <div class="stats">
    <div class="stat up">
      <div class="number">${hostsUp}</div>
      <div class="label">🟢 Activos</div>
    </div>
    <div class="stat down">
      <div class="number">${hostsDown}</div>
      <div class="label">🔴 Caídos</div>
    </div>
    <div class="stat degraded">
      <div class="number">${hostsDegraded}</div>
      <div class="label">🟡 Degradados</div>
    </div>
  </div>
  
  <p><strong>Total de hosts:</strong> ${total}</p>
  <p><strong>Incidentes abiertos:</strong> ${incidents}</p>
  
  <p><a href="${process.env.APP_URL || 'http://localhost:3050'}/monitoring.html">Ver Dashboard Completo</a></p>
</body>
</html>
    `;

    const emailTo = process.env.ALERT_EMAIL_TO;
    if (emailTo) {
      await this.sendEmail({
        to: emailTo.split(',').map(e => e.trim()),
        subject,
        html
      });
    }

    await this.sendTeams({
      title: subject,
      text: `Estado actual de los servidores monitoreados`,
      color: hostsDown > 0 ? 'FF0000' : '00FF00',
      facts: [
        { name: '🟢 Activos', value: String(hostsUp) },
        { name: '🔴 Caídos', value: String(hostsDown) },
        { name: '🟡 Degradados', value: String(hostsDegraded) },
        { name: 'Total', value: String(total) },
        { name: 'Incidentes', value: String(incidents) }
      ]
    });
  }
}

export default new NotificationService();
