import {
  getDuimpCapa,
  extrairAwbDaCapa,
  extrairCpfResponsavelDaCapa,
  buscarCargaPorAwb,
  getCctExtratoPdf,
} from "../portalUnico/client";
import { gerarExtratoDuimpPdf } from "../portalUnico/duimpExtratoPdf";
import { sendCalculoArmazenagemEmail } from "../mail";
import { config } from "../config";
import { DuimpRegistroEvent } from "../portalUnico/webhookTypes";

/**
 * Gatilho: evento `dimp-registro-import` (DUIMP registrada). A partir do
 * número da DUIMP no evento, busca a capa da DUIMP, confirma que quem
 * registrou é um despachante autorizado (evita disparar para DUIMPs de
 * clientes cujo despacho é feito por outra pessoa, mas que também aparecem
 * no Portal Único), descobre o AWB, emite o extrato em PDF do CCT
 * (equivalente à tela que hoje é enviada manualmente) e envia o e-mail de
 * solicitação de cálculo de armazenagem.
 */
export async function handleDuimpRegistro(event: DuimpRegistroEvent): Promise<void> {
  const numeroDuimp = event.payload.numeroDuimp;

  if (!numeroDuimp) {
    throw new Error(`Evento sem numeroDuimp: ${JSON.stringify(event.payload)}`);
  }

  const duimpCapa = await getDuimpCapa(numeroDuimp);

  const cpfResponsavel = extrairCpfResponsavelDaCapa(duimpCapa);
  const { cpfsResponsaveisAutorizados } = config.pucomex;
  if (cpfsResponsaveisAutorizados.length > 0 && !cpfsResponsaveisAutorizados.includes(cpfResponsavel ?? "")) {
    console.log(
      `DUIMP ${numeroDuimp} ignorada: responsável pelo registro (${cpfResponsavel ?? "desconhecido"}) ` +
        `não está na lista de despachantes autorizados.`,
    );
    return;
  }

  const numeroAwb = extrairAwbDaCapa(duimpCapa);
  if (!numeroAwb) {
    throw new Error(`Nenhum AWB (Conhecimento de Embarque) encontrado na DUIMP ${numeroDuimp}`);
  }

  const { idCarga } = await buscarCargaPorAwb(numeroAwb);
  const [cctExtratoPdf, duimpExtratoPdf] = await Promise.all([
    getCctExtratoPdf(idCarga),
    gerarExtratoDuimpPdf(duimpCapa),
  ]);

  await sendCalculoArmazenagemEmail({
    numeroDuimp,
    numeroAwb,
    attachments: [
      {
        filename: `duimp-${numeroDuimp}-extrato.pdf`,
        contentType: "application/pdf",
        contentBytes: duimpExtratoPdf.toString("base64"),
      },
      {
        filename: `cct-${numeroAwb}-extrato.pdf`,
        contentType: "application/pdf",
        contentBytes: cctExtratoPdf.toString("base64"),
      },
    ],
  });
}
