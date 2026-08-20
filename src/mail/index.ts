import { config } from "../config";
import { SendCalculoArmazenagemEmailInput } from "./types";
import { buildSubject, buildBody } from "./message";
import { sendCalculoArmazenagemEmail as sendViaGraph } from "./graphMailer";
import { sendCalculoArmazenagemEmail as sendViaSmtp } from "./smtpMailer";

export type { EmailAttachment, SendCalculoArmazenagemEmailInput } from "./types";

export async function sendCalculoArmazenagemEmail(
  input: SendCalculoArmazenagemEmailInput,
): Promise<void> {
  if (config.mail.dryRun) {
    console.log(
      `[DRY_RUN] E-mail NÃO enviado. Destinatários: ${config.mail.toTarifacao.join(", ") || "(não configurado)"}\n` +
        `Assunto: ${buildSubject(input)}\n` +
        `Corpo:\n${buildBody(input)}\n` +
        `Anexos: ${input.attachments.map((a) => `${a.filename} (${a.contentType}, ${Math.round((a.contentBytes.length * 0.75) / 1024)} KB)`).join(", ")}`,
    );
    return;
  }

  // Sem destinatário o envio "funcionaria" sem entregar nada a ninguém —
  // melhor falhar de forma visível no log do que sumir em silêncio.
  if (config.mail.toTarifacao.length === 0) {
    throw new Error("MAIL_TO_TARIFACAO não configurado: nenhum destinatário para a solicitação.");
  }

  if (config.mail.provider === "smtp") {
    await sendViaSmtp(input);
    return;
  }

  await sendViaGraph(input);
}
