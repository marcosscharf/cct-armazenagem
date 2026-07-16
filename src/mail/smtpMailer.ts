import nodemailer from "nodemailer";
import { config } from "../config";
import { SendCalculoArmazenagemEmailInput } from "./types";
import { buildSubject, buildBody } from "./message";

/**
 * Envio via SMTP genérico — usado para testar o fluxo localmente com uma
 * conta pessoal (ex: Gmail + "senha de app") sem depender do cadastro do
 * app no Microsoft Graph. Trocar para o graphMailer assim que o app
 * registration estiver pronto (MAIL_PROVIDER=graph).
 */
function smtpTransport() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

export async function sendCalculoArmazenagemEmail(
  input: SendCalculoArmazenagemEmailInput,
): Promise<void> {
  const transport = smtpTransport();

  await transport.sendMail({
    from: config.mail.from || config.smtp.user,
    to: config.mail.toTarifacao,
    cc: config.mail.cc.length > 0 ? config.mail.cc : undefined,
    subject: buildSubject(input),
    text: buildBody(input),
    attachments: input.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.contentBytes,
      encoding: "base64",
      contentType: attachment.contentType,
    })),
  });
}
