import {
  getDuimpCapa,
  extrairAwbDaCapa,
  buscarCargaPorAwb,
  getCctExtratoPdf,
} from "../portalUnico/client";
import { sendCalculoArmazenagemEmail } from "../mail";
import { DuimpRegistroEvent } from "../portalUnico/webhookTypes";

/**
 * Gatilho: evento `dimp-registro-import` (DUIMP registrada). A partir do
 * número da DUIMP no evento, busca a capa da DUIMP, descobre o AWB (via
 * documentosInstrucao), emite o extrato em PDF do CCT (equivalente à tela
 * que hoje é enviada manualmente) e envia o e-mail de solicitação de
 * cálculo de armazenagem.
 */
export async function handleDuimpRegistro(event: DuimpRegistroEvent): Promise<void> {
  const numeroDuimp = event.payload.numeroDuimp;

  if (!numeroDuimp) {
    throw new Error(`Evento sem numeroDuimp: ${JSON.stringify(event.payload)}`);
  }

  const duimpCapa = await getDuimpCapa(numeroDuimp);

  const numeroAwb = extrairAwbDaCapa(duimpCapa);
  if (!numeroAwb) {
    throw new Error(`Nenhum AWB (Conhecimento de Embarque) encontrado na DUIMP ${numeroDuimp}`);
  }

  const { idCarga } = await buscarCargaPorAwb(numeroAwb);
  const cctExtratoPdf = await getCctExtratoPdf(idCarga);

  await sendCalculoArmazenagemEmail({
    numeroDuimp,
    numeroAwb,
    attachments: [
      {
        filename: `duimp-${numeroDuimp}-capa.json`,
        contentType: "application/json",
        contentBytes: Buffer.from(JSON.stringify(duimpCapa.raw, null, 2)).toString("base64"),
      },
      {
        filename: `cct-${numeroAwb}-extrato.pdf`,
        contentType: "application/pdf",
        contentBytes: cctExtratoPdf.toString("base64"),
      },
    ],
  });
}
