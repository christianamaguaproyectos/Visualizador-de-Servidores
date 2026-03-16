import dotenv from 'dotenv';

// Intentar cargar variables de entorno desde .env si existiera (opcional)
try { dotenv.config?.(); } catch {}

const monitoringConfig = {
  enabled: process.env.MONITORING_ENABLED === '1',
  postgresUrl: process.env.POSTGRES_URL || '',
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