import nodemailer from 'nodemailer';

// Envío de correos (hoy, el enlace para recuperar la contraseña) por SMTP, con nodemailer. Se
// configura con variables de entorno:
//   SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_SECURE ("true" para TLS directo, normalmente con el
//   puerto 465; si no, STARTTLS), SMTP_USER y SMTP_PASSWORD (si el servidor pide autenticación) y
//   MAIL_FROM (remitente; por defecto SMTP_USER).
// Sin SMTP_HOST (desarrollo) no se envía nada: el correo se escribe en la consola del backend.

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export type EnvioCorreo = (correo: Correo) => Promise<void>;

function envioPorDefecto(): EnvioCorreo {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return async ({ para, asunto, texto }) => {
      console.log(`Correo sin enviar (falta SMTP_HOST) para ${para}: "${asunto}"\n${texto}`);
    };
  }
  const usuario = process.env.SMTP_USER;
  const transporte = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    ...(usuario && { auth: { user: usuario, pass: process.env.SMTP_PASSWORD ?? '' } }),
  });
  // || y no ??: docker-compose.yml pasa vacías las variables que no están en .env.
  const remitente = process.env.MAIL_FROM || usuario;
  return async ({ para, asunto, texto, html }) => {
    await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto, html });
  };
}

let envio: EnvioCorreo = envioPorDefecto();

export function enviarCorreo(correo: Correo): Promise<void> {
  return envio(correo);
}

// Para los tests: sustituye el envío (p. ej. para guardar los correos en vez de enviarlos).
export function cambiarEnvioCorreo(nuevo: EnvioCorreo): void {
  envio = nuevo;
}
