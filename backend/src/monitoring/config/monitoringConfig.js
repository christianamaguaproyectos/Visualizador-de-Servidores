// La carga del .env y la validación ocurren en un solo lugar: config/env.js
import env from '../../config/env.js';

const monitoringConfig = {
  enabled: env.MONITORING_ENABLED,
  postgresUrl: env.DATABASE_URL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
  defaults: {
    pingTimeoutMs: Number(process.env.DEFAULT_PING_TIMEOUT_MS || 2000),
    tcpTimeoutMs: Number(process.env.DEFAULT_TCP_TIMEOUT_MS || 2000),
    httpTimeoutMs: Number(process.env.DEFAULT_HTTP_TIMEOUT_MS || 3000),
    retries: Number(process.env.DEFAULT_CHECK_RETRIES || 0)
  },
  worker: {
    concurrency: Number(process.env.CHECK_WORKER_CONCURRENCY || 10)
  }
};

export default monitoringConfig;
