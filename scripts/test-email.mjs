import nodemailer from 'nodemailer';

const config = {
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  to: process.env.ALERT_EMAIL_TO || ''
};

console.log('🔧 Configuración SMTP:', {
  host: config.host,
  port: config.port,
  user: config.user,
  to: config.to
});

if (!config.user || !config.pass) {
  console.error('❌ Error: SMTP_USER y SMTP_PASS son requeridos');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: false, // TLS
  auth: {
    user: config.user,
    pass: config.pass
  },
  tls: {
    rejectUnauthorized: false
  }
});

console.log('📧 Enviando email de prueba...');

try {
  const info = await transporter.sendMail({
    from: config.user,
    to: config.to || config.user,
    subject: '🧪 Test de Alertas - Sistema de Monitoreo',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #22c55e;">✅ Prueba de Email Exitosa</h1>
        <p>Este es un email de prueba del sistema de monitoreo de servidores.</p>
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Servidor SMTP:</strong> ${config.host}:${config.port}</p>
          <p><strong>Usuario:</strong> ${config.user}</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-EC')}</p>
        </div>
        <p style="color: #6b7280; font-size: 12px;">Sistema de Monitoreo de Servidores - Grupo Danec</p>
      </div>
    `,
    text: 'Prueba de email del sistema de monitoreo - ' + new Date().toLocaleString('es-EC')
  });
  
  console.log('✅ Email enviado correctamente!');
  console.log('   Message ID:', info.messageId);
  console.log('   Response:', info.response);
} catch (err) {
  console.error('❌ Error enviando email:', err.message);
  if (err.code) console.error('   Código:', err.code);
  if (err.responseCode) console.error('   Response Code:', err.responseCode);
  process.exit(1);
}
