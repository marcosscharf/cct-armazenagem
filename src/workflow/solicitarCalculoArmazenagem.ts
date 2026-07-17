import {
  getDuimpCapa,
  getDuimpItens,
  extrairAwbDaCapa,
  extrairCpfResponsavelDaCapa,
  extrairCodigoRecintoDaCapa,
  extrairNomeImportadorDaCapa,
  extrairCnpjImportadorDaCapa,
  extrairReferenciaNicomexDaCapa,
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
 * no Portal Único) e que o recinto aduaneiro é o RioGaleão (evita disparar
 * para cargas de outros aeroportos), descobre o AWB, emite o extrato em PDF
 * do CCT (equivalente à tela que hoje é enviada manualmente) e envia o
 * e-mail de solicitação de cálculo de armazenagem.
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

  const codigoRecinto = extrairCodigoRecintoDaCapa(duimpCapa);
  const { codigosRecintoAutorizados } = config.pucomex;
  if (codigosRecintoAutorizados.length > 0 && !codigosRecintoAutorizados.includes(codigoRecinto ?? "")) {
    console.log(
      `DUIMP ${numeroDuimp} ignorada: recinto aduaneiro (${codigoRecinto ?? "desconhecido"}) ` +
        `não está na lista de recintos autorizados.`,
    );
    return;
  }

  const numeroAwb = extrairAwbDaCapa(duimpCapa);
  if (!numeroAwb) {
    throw new Error(`Nenhum AWB (Conhecimento de Embarque) encontrado na DUIMP ${numeroDuimp}`);
  }

  const [{ idCarga }, duimpItens] = await Promise.all([
    buscarCargaPorAwb(numeroAwb),
    getDuimpItens(numeroDuimp, duimpCapa.versao),
  ]);
  const [cctExtratoPdf, duimpExtratoPdf] = await Promise.all([
    getCctExtratoPdf(idCarga),
    gerarExtratoDuimpPdf(duimpCapa, duimpItens),
  ]);

  const cnpjImportador = extrairCnpjImportadorDaCapa(duimpCapa);
  const cnpjPagador = cnpjImportador ? config.pucomex.cnpjPagadorOverrides[cnpjImportador] ?? null : null;

  await sendCalculoArmazenagemEmail({
    numeroDuimp,
    numeroAwb,
    nomeImportador: extrairNomeImportadorDaCapa(duimpCapa),
    referenciaNicomex: extrairReferenciaNicomexDaCapa(duimpCapa),
    cnpjPagador,
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
