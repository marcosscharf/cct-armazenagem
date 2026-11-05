import {
  getDuimpCapaQuandoRegistrada,
  getDuimpItens,
  extrairAwbDaCapa,
  extrairCpfResponsavelDaCapa,
  despachadaPelaNicomex,
  extrairCodigoRecintoDaCapa,
  extrairNomeImportadorDaCapa,
  extrairCnpjImportadorDaCapa,
  extrairReferenciaNicomexDaCapa,
  buscarCargaPorAwb,
  CargaNaoEncontradaError,
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

export function handleDuimpRegistro(
  numeroDuimp: string,
  identificacaoCargaDoEvento: string | null = null,
): Promise<void> {
  const anterior = filas.get(numeroDuimp) ?? Promise.resolve();
  // `.then` com os dois callbacks: a falha de um evento não pode impedir
  // que o próximo da mesma DUIMP seja processado.
  const atual = anterior.then(
    () => processarDuimp(numeroDuimp, identificacaoCargaDoEvento),
    () => processarDuimp(numeroDuimp, identificacaoCargaDoEvento),
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
 * Encontra a carga no CCT, devolvendo o AWB que funcionou (é o que vai no
 * e-mail) e o ID interno da carga.
 *
 * Tenta primeiro o AWB digitado na DUIMP e, se o CCT não o conhecer, a
 * identificação da carga que o próprio CCT mandou no evento de vinculação.
 * Observado em produção: duas DUIMPs com AWB master `0012794574A` e
 * `0570595214A`, enquanto o evento trazia `001-27945746` e `057-05952144` —
 * o último dígito trocado por um "A" na DUIMP. A busca pelo AWB da DUIMP não
 * achava nada e as duas solicitações se perderam.
 *
 * A identificação do evento é tentada como veio e também só com os dígitos,
 * que é como o CCT aceita AWB master (um evento com `006-53690361` foi
 * processado normalmente como `00653690361`).
 *
 * Só "carga não encontrada" passa para o próximo número. Uma falha do Portal
 * Único é propagada: tentar outro número não resolveria uma instabilidade.
 */
async function localizarCarga(
  numeroDuimp: string,
  awbDaDuimp: string | null,
  identificacaoCargaDoEvento: string | null,
): Promise<{ numeroAwb: string; idCarga: string }> {
  const candidatos = [
    awbDaDuimp,
    identificacaoCargaDoEvento,
    identificacaoCargaDoEvento?.replace(/[^0-9A-Za-z]/g, ""),
  ].filter((numero, indice, todos): numero is string => !!numero && todos.indexOf(numero) === indice);

  if (candidatos.length === 0) {
    throw new Error(
      `Nenhum AWB (Conhecimento de Embarque) encontrado na DUIMP ${numeroDuimp}, ` +
        `nem identificação da carga no evento`,
    );
  }

  for (const numero of candidatos) {
    try {
      const { idCarga } = await buscarCargaPorAwb(numero);
      if (numero !== awbDaDuimp) {
        console.log(
          `DUIMP ${numeroDuimp}: AWB da DUIMP (${awbDaDuimp ?? "ausente"}) não encontrado no CCT; ` +
            `usando a identificação da carga informada pelo Portal Único (${numero}).`,
        );
      }
      return { numeroAwb: numero, idCarga };
    } catch (err) {
      if (!(err instanceof CargaNaoEncontradaError)) {
        throw err;
      }
    }
  }

  throw new Error(`Carga da DUIMP ${numeroDuimp} não encontrada no CCT com nenhum destes números: ${candidatos.join(", ")}`);
}

/**
 * Busca a capa da DUIMP, confirma que quem registrou é um despachante
 * autorizado (evita disparar para DUIMPs de clientes cujo despacho é feito
 * por outra pessoa, mas que também aparecem no Portal Único) e que o
 * recinto tem destino configurado, descobre o AWB, emite o extrato em PDF
 * do CCT (equivalente à tela que hoje é enviada manualmente) e envia o
 * e-mail de solicitação de cálculo de armazenagem.
 */
async function processarDuimp(
  numeroDuimp: string,
  identificacaoCargaDoEvento: string | null,
): Promise<void> {
  const enviadoEm = envioRecente(numeroDuimp);
  if (enviadoEm) {
    console.log(
      `DUIMP ${numeroDuimp} ignorada: solicitação já enviada em ` +
        `${enviadoEm.toLocaleString("pt-BR")} (evento repetido de vinculação de carga).`,
    );
    return;
  }

  const duimpCapa = await getDuimpCapaQuandoRegistrada(numeroDuimp);

  // Três formas de reconhecer que o despacho é nosso, em OU:
  //
  // 1. A DUIMP traz o texto padrão da Nicomex nas informações
  //    complementares. É o critério mais confiável, porque a linha é
  //    incluída ao montar a DUIMP, independentemente de quem a registra.
  // 2. Quem registrou é um despachante da casa.
  // 3. O importador está na lista de clientes nossos.
  //
  // Os dois últimos são redes de segurança para o caso de o texto padrão
  // faltar em alguma DUIMP. Sem nenhum critério configurado, não há filtro.
  const cpfResponsavel = extrairCpfResponsavelDaCapa(duimpCapa);
  const cnpjImportador = extrairCnpjImportadorDaCapa(duimpCapa);
  const { cpfsResponsaveisAutorizados, cnpjsImportadoresAutorizados, marcadorDespachoProprio } =
    config.pucomex;

  const temFiltro =
    marcadorDespachoProprio.length > 0 ||
    cpfsResponsaveisAutorizados.length > 0 ||
    cnpjsImportadoresAutorizados.length > 0;
  const nossoPeloTexto = despachadaPelaNicomex(duimpCapa);
  const nossoPeloDespachante = cpfsResponsaveisAutorizados.includes(cpfResponsavel ?? "");
  const nossoPeloCliente = cnpjsImportadoresAutorizados.includes(cnpjImportador ?? "");

  if (temFiltro && !nossoPeloTexto && !nossoPeloDespachante && !nossoPeloCliente) {
    console.log(
      `DUIMP ${numeroDuimp} ignorada: não identificada como despacho nosso ` +
        `(sem o texto padrão nas informações complementares; responsável pelo registro ` +
        `${cpfResponsavel ?? "desconhecido"}, importador ${cnpjImportador ?? "desconhecido"}).`,
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

  const [{ numeroAwb, idCarga }, duimpItens] = await Promise.all([
    localizarCarga(numeroDuimp, extrairAwbDaCapa(duimpCapa), identificacaoCargaDoEvento),
    getDuimpItens(numeroDuimp, duimpCapa.versao),
  ]);
  const [cctExtratoPdf, duimpExtratoPdf] = await Promise.all([
    getCctExtratoPdf(idCarga),
    gerarExtratoDuimpPdf(duimpCapa, duimpItens),
  ]);

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
