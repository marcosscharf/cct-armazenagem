import {
  getDuimpExtrato,
  extrairAwbsDoExtrato,
  buscarCargaPorAwb,
  getCctExtratoPdf,
} from "../portalUnico/client";
import { sendCalculoArmazenagemEmail } from "../mail/graphMailer";
import { DuimpRegistroEvent } from "../portalUnico/webhookTypes";

/**
 * Gatilho: evento `dimp-registro-import` (DUIMP registrada). A partir do
 * número da DUIMP no evento, busca o extrato, descobre o AWB, emite o
 * extrato em PDF do CCT (equivalente à tela que hoje é enviada manualmente)
 * e envia o e-mail de solicitação de cálculo de armazenagem.
 */
export async function handleDuimpRegistro(event: DuimpRegistroEvent): Promise<void> {
  const numeroDuimp = event.payload.numeroDuimp;

  if (!numeroDuimp) {
    throw new Error(`Evento sem numeroDuimp: ${JSON.stringify(event.payload)}`);
  }

  const duimpExtrato = await getDuimpExtrato(numeroDuimp);

  const awbs = extrairAwbsDoExtrato(duimpExtrato);
  if (awbs.length === 0) {
    throw new Error(`Nenhum AWB encontrado no extrato da DUIMP ${numeroDuimp}`);
  }

  // Em geral uma DUIMP tem um AWB; se houver mais de um, usa o primeiro e
  // registra os demais no log para revisão manual.
  const numeroAwb = awbs[0];
  if (awbs.length > 1) {
    console.warn(`DUIMP ${numeroDuimp} tem múltiplos AWBs: ${awbs.join(", ")}. Usando ${numeroAwb}.`);
  }

  const { idCarga } = await buscarCargaPorAwb(numeroAwb);
  const cctExtratoPdf = await getCctExtratoPdf(idCarga);

  await sendCalculoArmazenagemEmail({
    numeroDuimp,
    numeroAwb,
    attachments: [
      {
        filename: `duimp-${numeroDuimp}-itens.json`,
        contentType: "application/json",
        contentBytes: Buffer.from(JSON.stringify(duimpExtrato.raw, null, 2)).toString("base64"),
      },
      {
        filename: `cct-${numeroAwb}-extrato.pdf`,
        contentType: "application/pdf",
        contentBytes: cctExtratoPdf.toString("base64"),
      },
    ],
  });
}
