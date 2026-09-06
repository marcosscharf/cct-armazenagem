import {
  getDuimpCapaQuandoRegistrada,
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
import { rotaDoRecinto } from "../mail/rotas";
import { envioRecente, registrarEnvio } from "./duimpsEnviadas";
import { config } from "../config";

/**
 * Uma fila por DUIMP, para que eventos da mesma DUIMP sejam processados em
 * sequência e não em paralelo.
 *
 * Sem isso a checagem de envio duplicado não adiantaria: o Portal Único
 * dispara um evento a cada vinculação de carga, e numa DUIMP cujo registro
 * falhou e foi repetido chegaram quatro eventos em dez minutos. Todos
 * ficariam esperando o registro ao mesmo tempo, todos veriam "ainda não
 * enviada" e todos mandariam e-mail.
 */
const filas = new Map<string, Promise<unknown>>();

export function handleDuimpRegistro(numeroDuimp: string): Promise<void> {
  const anterior = filas.get(numeroDuimp) ?? Promise.resolve();
  // `.then` com os dois callbacks: a falha de um evento não pode impedir
  // que o próximo da mesma DUIMP seja processado.
  const atual = anterior.then(
    () => processarDuimp(numeroDuimp),
    () => processarDuimp(numeroDuimp),
  );

  const naFila = atual.catch(() => undefined);
  filas.set(numeroDuimp, naFila);
  void naFila.then(() => {
    if (filas.get(numeroDuimp) === naFila) {
      filas.delete(numeroDuimp);
    }
  });

  return atual;
}

/**
 * Busca a capa da DUIMP, confirma que quem registrou é um despachante
 * autorizado (evita disparar para DUIMPs de clientes cujo despacho é feito
 * por outra pessoa, mas que também aparecem no Portal Único) e que o
 * recinto tem destino configurado, descobre o AWB, emite o extrato em PDF
 * do CCT (equivalente à tela que hoje é enviada manualmente) e envia o
 * e-mail de solicitação de cálculo de armazenagem.
 */
async function processarDuimp(numeroDuimp: string): Promise<void> {
  const enviadoEm = envioRecente(numeroDuimp);
  if (enviadoEm) {
    console.log(
      `DUIMP ${numeroDuimp} ignorada: solicitação já enviada em ` +
        `${enviadoEm.toLocaleString("pt-BR")} (evento repetido de vinculação de carga).`,
    );
    return;
  }

  const duimpCapa = await getDuimpCapaQuandoRegistrada(numeroDuimp);

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
  const rota = rotaDoRecinto(codigoRecinto);
  if (!rota) {
    console.log(
      `DUIMP ${numeroDuimp} ignorada: recinto aduaneiro (${codigoRecinto ?? "desconhecido"}) ` +
        `não tem destino configurado.`,
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
  const nomeImportador = extrairNomeImportadorDaCapa(duimpCapa);
  const referenciaNicomex = extrairReferenciaNicomexDaCapa(duimpCapa);

  await sendCalculoArmazenagemEmail({
    numeroDuimp,
    numeroAwb,
    nomeImportador,
    referenciaNicomex,
    cnpjPagador,
    rota,
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

  registrarEnvio(numeroDuimp);

  console.log(
    `DUIMP ${numeroDuimp} processada: e-mail ${config.mail.dryRun ? "SIMULADO (DRY_RUN)" : "enviado"} ` +
      `para ${rota.nome} (${rota.para.join(", ")}) — cliente ${nomeImportador ?? "?"}, ` +
      `ref ${referenciaNicomex ?? "não encontrada"}, AWB ${numeroAwb}` +
      `${cnpjPagador ? `, CNPJ pagador ${cnpjPagador}` : ""}.`,
  );
}
