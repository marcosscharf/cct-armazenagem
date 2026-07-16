import { config } from "../config";
import { SendCalculoArmazenagemEmailInput } from "./types";
import { sendCalculoArmazenagemEmail as sendViaGraph } from "./graphMailer";
import { sendCalculoArmazenagemEmail as sendViaSmtp } from "./smtpMailer";

export type { EmailAttachment, SendCalculoArmazenagemEmailInput } from "./types";

export async function sendCalculoArmazenagemEmail(
  input: SendCalculoArmazenagemEmailInput,
): Promise<void> {
  if (config.mail.dryRun) {
    console.log(
      `[DRY_RUN] E-mail NÃO enviado. Destinatário: ${config.mail.toTarifacao || "(não configurado)"}\n` +
        `Assunto: Solicitação de cálculo de armazenagem — AWB ${input.numeroAwb} / DUIMP ${input.numeroDuimp}\n` +
        `Anexos: ${input.attachments.map((a) => `${a.filename} (${a.contentType}, ${Math.round((a.contentBytes.length * 0.75) / 1024)} KB)`).join(", ")}`,
    );
    return;
  }

  if (config.mail.provider === "smtp") {
    await sendViaSmtp(input);
    return;
  }

  await sendViaGraph(input);
}
