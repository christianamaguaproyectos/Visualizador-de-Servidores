import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger.js';

class PasswordRecoveryService {
  constructor() {
    this.transporter = null;
    this.smtpConfigured = false;
    this._initTransporter();
  }

  _initTransporter() {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (!host || !user || !pass) {
      this.smtpConfigured = false;
      Logger.warn('📧 Recuperación de contraseña: SMTP no configurado');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    this.smtpConfigured = true;
    Logger.info('📧 Recuperación de contraseña: SMTP configurado');
  }

  async sendResetEmail({ to, name, resetLink }) {
    if (!this.smtpConfigured || !this.transporter) {
      return { sent: false, reason: 'smtp_not_configured' };
    }

    const safeName = name || 'usuario';
    const subject = 'Recuperación de contraseña - Diagrama de Servidores';
    const text = [
      `Hola ${safeName},`,
      'Recibimos una solicitud para restablecer tu contraseña.',
      `Usa este enlace: ${resetLink}`,
      'Este enlace expira en 30 minutos.',
      'Si no solicitaste este cambio, ignora este mensaje.'
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2 style="margin-bottom: 12px;">Recuperación de contraseña</h2>
        <p>Hola <strong>${safeName}</strong>,</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
            Restablecer contraseña
          </a>
        </p>
        <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
        <p>${resetLink}</p>
        <p>Este enlace expira en 30 minutos.</p>
        <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to,
        subject,
        text,
        html
      });
      return { sent: true };
    } catch (error) {
      Logger.error('❌ Error enviando email de recuperación:', error.message);
      return { sent: false, reason: 'send_failed' };
    }
  }

  async sendInvitationEmail({ to, name, inviteLink }) {
    if (!this.smtpConfigured || !this.transporter) {
      return { sent: false, reason: 'smtp_not_configured' };
    }

    const safeName = name || 'usuario';
    const subject = 'Bienvenido a Diagrama de Servidores - Configura tu contraseña';
    const text = [
      `Hola ${safeName},`,
      'Se ha creado tu cuenta en Diagrama de Servidores.',
      `Usa este enlace para establecer tu contraseña: ${inviteLink}`,
      'Este enlace expira en 48 horas.',
      'Si no esperabas este mensaje, ignóralo.'
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2 style="margin-bottom: 12px;">¡Bienvenido a Diagrama de Servidores!</h2>
        <p>Hola <strong>${safeName}</strong>,</p>
        <p>Se ha creado tu cuenta. Para comenzar a usar el sistema, establece tu contraseña haciendo clic en el botón:</p>
        <p>
          <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Establecer mi contraseña
          </a>
        </p>
        <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
        <p style="word-break:break-all;">${inviteLink}</p>
        <p>Este enlace expira en <strong>48 horas</strong>.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="color:#6b7280;font-size:12px;">Si no esperabas este mensaje, ignóralo.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to,
        subject,
        text,
        html
      });
      return { sent: true };
    } catch (error) {
      Logger.error('❌ Error enviando email de invitación:', error.message);
      return { sent: false, reason: 'send_failed' };
    }
  }
}

export default new PasswordRecoveryService();
