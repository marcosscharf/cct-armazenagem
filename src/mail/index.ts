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
      `[DRY_RUN] E-mail NÃO enviado. Destino ${input.rota.nome}: ` +
        `${input.rota.para.join(", ") || "(não configurado)"}\n` +
        `Assunto: ${buildSubject(input)}\n` +
        `Corpo:\n${buildBody(input)}\n` +
        `Anexos: ${input.attachments.map((a) => `${a.filename} (${a.contentType}, ${Math.round((a.contentBytes.length * 0.75) / 1024)} KB)`).join(", ")}`,
    );
    return;
  }

  // Sem destinatário o envio "funcionaria" sem entregar nada a ninguém —
  // melhor falhar de forma visível no log do que sumir em silêncio.
  if (input.rota.para.length === 0) {
    throw new Error(
      `Nenhum destinatário configurado para o destino ${input.rota.nome} ` +
        `(recinto ${input.rota.codigoRecinto}). Verifique o .env.`,
    );
  }

  if (config.mail.provider === "smtp") {
    await sendViaSmtp(input);
    return;
  }

  await sendViaGraph(input);
}
