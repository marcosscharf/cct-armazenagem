import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { descreverErro } from "./erros";

interface Session {
  jwt: string;
  csrfToken: string;
  expiresAt: number;
}

let sessionCache: Session | null = null;

/**
 * Login em andamento, compartilhado por quem pedir sessão enquanto ele não
 * termina.
 *
 * O Portal Único recusa um segundo login feito menos de 60 segundos depois
 * do anterior (`PLAT-ER2033 - Usuário realizou autenticação válida nos
 * últimos 60 segundos. O token gerado deve ser reaproveitado`). Sem isso,
 * quando a sessão expirava, as chamadas que o workflow dispara em paralelo
 * (carga no CCT + itens da DUIMP, ou duas DUIMPs ao mesmo tempo) pediam
 * login cada uma, e a segunda era recusada. Observado em produção: três
 * solicitações perdidas por esse motivo.
 */
let loginEmAndamento: Promise<Session> | null = null;

async function authenticate(): Promise<Session> {
  if (sessionCache && sessionCache.expiresAt > Date.now() + 5_000) {
    return sessionCache;
  }
  if (!loginEmAndamento) {
    loginEmAndamento = autenticarNoPortal().finally(() => {
      loginEmAndamento = null;
    });
  }
  return loginEmAndamento;
}

/**
 * Troca o par Client-Id / Client-Secret (Chave de Acesso) por uma sessão
 * autenticada, conforme docs.portalunico.siscomex.gov.br/api/plat/:
 * POST {authBaseUrl}/api/autenticar/chave-acesso
 * Headers: Client-Id, Client-Secret, Role-Type
 *
 * Confirmado via chamadas reais (curl + inspeção de rede do navegador) que o
 * mecanismo de autenticação nos módulos de negócio (duimp/ccta) NÃO é
 * "Authorization: Bearer" — é um cookie `JWTPCMX_USR` com o JWT retornado no
 * header `Set-Token`, combinado com o header `X-Csrf-Token` (retornado no
 * header `X-CSRF-Token` da autenticação). A validade do CSRF token vem no
 * header `X-CSRF-Expiration` (epoch em milissegundos).
 */
async function autenticarNoPortal(): Promise<Session> {
  const response = await axios.post(
    `${config.pucomex.authBaseUrl}/api/autenticar/chave-acesso`,
    undefined,
    {
      headers: {
        "Client-Id": config.pucomex.clientId,
        "Client-Secret": config.pucomex.clientSecret,
        "Role-Type": config.pucomex.roleType,
      },
    },
  );

  const jwt: string | undefined = response.headers["set-token"];
  const csrfToken: string | undefined = response.headers["x-csrf-token"];
  const expirationHeader = response.headers["x-csrf-expiration"];

  if (!jwt || !csrfToken) {
    throw new Error(
      "Autenticação no Portal Único não retornou Set-Token/X-CSRF-Token",
    );
  }

  const expiresAt = expirationHeader ? Number(expirationHeader) : Date.now() + 4 * 60 * 1000;

  sessionCache = { jwt, csrfToken, expiresAt };
  return sessionCache;
}

async function httpClient(): Promise<AxiosInstance> {
  const { jwt, csrfToken } = await authenticate();
  return axios.create({
    baseURL: config.pucomex.apiBaseUrl,
    headers: {
      Cookie: `JWTPCMX_USR=${jwt}`,
      "X-Csrf-Token": csrfToken,
    },
  });
}

export interface DuimpCapa {
  numeroDuimp: string;
  versao: string;
  raw: unknown;
}

/**
 * Busca a "capa" da DUIMP (dados gerais: importador, carga, documentos de
 * instrução, tributos, histórico etc). Endpoint e autenticação confirmados
 * via chamada real:
 * GET /duimp/api/duimp/{numeroDuimp}/consulta?cache=true
 *
 * O campo `informacaoComplementar` já traz um resumo textual completo
 * (fatura, conhecimento, valores, tributos, despachantes) equivalente ao
 * extrato lido manualmente hoje — por isso é essa a fonte usada para o
 * anexo de "extrato da DUIMP" no e-mail, não o endpoint de itens.
 */
export async function getDuimpCapa(numeroDuimp: string): Promise<DuimpCapa> {
  const client = await httpClient();
  const { data } = await client.get(`/duimp/api/duimp/${numeroDuimp}/consulta`, {
    params: { cache: true },
  });
  return { numeroDuimp, versao: data?.versao, raw: data };
}

/** 422 com `DIMP-ER0102` = "Duimp não registrada" (ainda). */
function ehDuimpAindaNaoRegistrada(err: unknown): boolean {
  return (
    axios.isAxiosError(err) &&
    err.response?.status === 422 &&
    err.response.data?.code === "DIMP-ER0102"
  );
}

/**
 * 422 com `PLAT-ER2033`: login recusado porque outro foi feito há menos de
 * 60 segundos. O compartilhamento do login em `authenticate` evita isso
 * dentro deste serviço, mas a mesma Chave de Acesso pode estar em uso em
 * outro lugar (um teste local, por exemplo). Esperar e tentar de novo
 * resolve.
 */
function ehLoginRecente(err: unknown): boolean {
  return (
    axios.isAxiosError(err) &&
    err.response?.status === 422 &&
    err.response.data?.code === "PLAT-ER2033"
  );
}

/**
 * Falha momentânea do lado do Portal Único: erro 5xx (observados em
 * produção: `500 PUCX-ER0001 - Ocorreu um erro inesperado` e `503` no
 * extrato do CCT) ou queda de conexão, sem resposta HTTP. Não é problema do
 * nosso pedido, então repetir tem chance real de funcionar.
 *
 * 4xx fica de fora de propósito: são respostas sobre o pedido em si (não
 * existe, sem permissão, formato inválido) e repetir só atrasaria o
 * inevitável. As exceções são o login recente e, na leitura da DUIMP, o
 * "ainda não registrada".
 */
function ehFalhaTransitoria(err: unknown): boolean {
  if (!axios.isAxiosError(err)) {
    return false;
  }
  const status = err.response?.status;
  return status === undefined || status >= 500;
}

/** Por que vale repetir a chamada, ou null quando não vale. */
type MotivoParaRepetir = (err: unknown) => string | null;

const motivoTransitorio: MotivoParaRepetir = (err) => {
  if (ehLoginRecente(err)) {
    return "login recente no Portal Único, aguardando para entrar de novo";
  }
  if (ehFalhaTransitoria(err)) {
    return `falha momentânea do Portal Único (${descreverErro(err)})`;
  }
  return null;
};

/**
 * Esperas entre tentativas (~9 minutos no total). Cobrem tanto a DUIMP que
 * ainda não ficou consultável (observado: vinculação às 17:44:32 e consulta
 * recusada com "Duimp não registrada" às 17:44:39) quanto instabilidades do
 * Portal Único, que costumam durar minutos.
 */
const ESPERAS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

/**
 * Executa uma chamada ao Portal Único repetindo-a enquanto a falha for
 * passageira.
 *
 * Vale para todas as chamadas, não só a leitura da DUIMP: o Portal Único não
 * reenvia a notificação depois que respondemos 200, então desistir de uma
 * falha passageira em qualquer etapa perde a solicitação de vez. Observado
 * em produção: extrato do CCT respondendo 503, e-mail não enviado.
 *
 * O processamento roda em segundo plano (a resposta ao webhook já foi
 * enviada), então esperar aqui não afeta o Portal Único. Cada tentativa
 * pede a sessão de novo, o que renova o login se ele expirar durante a
 * espera.
 */
async function comRetentativas<T>(
  descricao: string,
  operacao: () => Promise<T>,
  motivoParaRepetir: MotivoParaRepetir = motivoTransitorio,
): Promise<T> {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await operacao();
    } catch (err) {
      const motivo = motivoParaRepetir(err);
      if (!motivo || tentativa >= ESPERAS_MS.length) {
        throw err;
      }
      const espera = ESPERAS_MS[tentativa];
      console.log(
        `${descricao}: ${motivo}; nova tentativa em ${espera / 1000}s ` +
          `(${tentativa + 1}/${ESPERAS_MS.length}).`,
      );
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }
}

/** Busca a capa da DUIMP, aguardando quando ela ainda não foi registrada. */
export function getDuimpCapaQuandoRegistrada(numeroDuimp: string): Promise<DuimpCapa> {
  return comRetentativas(
    `DUIMP ${numeroDuimp}`,
    () => getDuimpCapa(numeroDuimp),
    (err) => (ehDuimpAindaNaoRegistrada(err) ? "ainda não registrada" : motivoTransitorio(err)),
  );
}

export interface DuimpItem {
  numeroItem?: string;
  codigoProduto?: string;
  versaoProduto?: string;
  indicadorAdquirente?: { descricao?: string };
  ncm?: { codigo?: string; descricao?: string };
  produto?: { descricao?: string; denominacao?: string; atributos?: AtributoDuimp[] };
  fabricanteCodigo?: string;
  fabricanteNome?: string;
  fabricanteVersao?: string;
  fabricanteEndereco?: string;
  fabricanteTin?: string;
  fabricantePais?: { codigo?: string; descricao?: string };
  indicadorExportadorFabricante?: { descricao?: string };
  indicadorCompradorVendedor?: { descricao?: string };
  exportadorCodigo?: string;
  exportadorNome?: string;
  exportadorVersao?: string;
  exportadorEndereco?: string;
  exportadorTin?: string;
  exportadorPais?: { codigo?: string; descricao?: string };
  tipoAplicacao?: { descricao?: string };
  condicao?: { descricao?: string };
  dadosMercadoriaMedidaEstatisticaUnidade?: string;
  dadosMercadoriaMedidaEstatisticaQuantidade?: number;
  dadosMercadoriaPesoLiquido?: number;
  quantidadeComercial?: number;
  moedaNegociada?: { descricao?: string };
  valorUnitarioMoedaNegociada?: string | number;
  valorMercadoriaCondicaoVenda?: number;
  descricaoMercadoria?: string | null;
  atributos?: AtributoDuimp[];
  tributos?: {
    tributo?: { descricao?: string };
    regime?: { descricao?: string };
    fundamento?: { descricao?: string };
    atributos?: AtributoDuimp[];
  }[];
}

export interface AtributoDuimp {
  nomeApresentacao?: string;
  valor?: string | null;
}

/**
 * Busca os itens (produtos) da DUIMP — código, NCM, fabricante, exportador,
 * dados da mercadoria, atributos e tributos por item. Endpoint confirmado
 * via chamada real: GET /duimp/api/duimp/extrato/{numeroDuimp}/{versaoDuimp}/itens
 *
 * A API valida a faixa de itens contra a quantidade real e retorna 422
 * (`DIMP-ER0100`) se pedirmos além do último item existente — como não
 * sabemos de antemão quantos itens a DUIMP tem, tentamos uma faixa generosa
 * e, se cair nesse erro, extraímos o limite real da mensagem e tentamos de
 * novo.
 */
export function getDuimpItens(numeroDuimp: string, versaoDuimp: string): Promise<DuimpItem[]> {
  return comRetentativas(`Itens da DUIMP ${numeroDuimp}`, async () => {
    const client = await httpClient();

    const buscarItens = (faixaItens: string) =>
      client.get(`/duimp/api/duimp/extrato/${numeroDuimp}/${versaoDuimp}/itens`, {
        params: { "faixa-itens": faixaItens, cache: true },
      });

    try {
      const { data } = await buscarItens("1-999");
      return data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const mensagem: string = err.response.data?.message ?? "";
        const match = /último item ativo:\s*(\d+)/i.exec(mensagem);
        if (match) {
          const { data } = await buscarItens(`1-${match[1]}`);
          return data;
        }
      }
      throw err;
    }
  });
}

interface PalavraChave {
  nomeApresentacao?: string;
  valor?: string;
}

interface DocumentoInstrucao {
  tipo?: { codigo?: string; descricao?: string };
  palavrasChave?: PalavraChave[];
}

/**
 * Extrai o número do AWB (Conhecimento de Embarque) da capa da DUIMP.
 * Confirmado via payload real: em `documentosInstrucao`, o item com
 * `tipo.codigo === "30"` ("Conhecimento de Embarque") tem uma palavra-chave
 * "Número" com o AWB limpo (ex: "HA551023") — mais confiável do que extrair
 * do RUC (`cargaIdentificacao`), que embute o AWB numa string maior de
 * formato variável.
 */
export function extrairAwbDaCapa(capa: DuimpCapa): string | null {
  const raw = capa.raw as { documentosInstrucao?: DocumentoInstrucao[] } | undefined;
  const documentos = raw?.documentosInstrucao ?? [];

  const conhecimento = documentos.find((doc) => doc.tipo?.codigo === "30");
  const numero = conhecimento?.palavrasChave?.find((p) => p.nomeApresentacao === "Número")?.valor;

  return numero?.trim() || null;
}

/**
 * Extrai o CPF (só dígitos) de quem registrou a DUIMP, a partir do campo
 * `responsavelRegistroNumero` da capa.
 */
export function extrairCpfResponsavelDaCapa(capa: DuimpCapa): string | null {
  const raw = capa.raw as { responsavelRegistroNumero?: string } | undefined;
  const cpf = raw?.responsavelRegistroNumero?.replace(/\D/g, "");
  return cpf || null;
}

/**
 * Extrai o código do recinto aduaneiro (URF de despacho) da capa da DUIMP,
 * a partir do campo `urfDespacho.codigo` (ex: "0717700" -> "AEROPORTO
 * INTERNACIONAL GALEÃO"). É esse código que identifica em qual
 * aeroporto/recinto a carga está sendo desembaraçada.
 */
export function extrairCodigoRecintoDaCapa(capa: DuimpCapa): string | null {
  const raw = capa.raw as { urfDespacho?: { codigo?: string } } | undefined;
  const codigo = raw?.urfDespacho?.codigo?.trim();
  return codigo || null;
}

/**
 * Extrai o nome do importador a partir de `identificacao.cpfCnpj.descricao`
 * na capa da DUIMP.
 */
export function extrairNomeImportadorDaCapa(capa: DuimpCapa): string | null {
  const raw = capa.raw as { identificacao?: { cpfCnpj?: { descricao?: string } } } | undefined;
  const nome = raw?.identificacao?.cpfCnpj?.descricao?.trim();
  return nome || null;
}

/**
 * Extrai o CNPJ (só dígitos) do importador a partir de
 * `identificacao.cpfCnpj.codigo` na capa da DUIMP.
 */
export function extrairCnpjImportadorDaCapa(capa: DuimpCapa): string | null {
  const raw = capa.raw as { identificacao?: { cpfCnpj?: { codigo?: string } } } | undefined;
  const cnpj = raw?.identificacao?.cpfCnpj?.codigo?.replace(/\D/g, "");
  return cnpj || null;
}

/**
 * Extrai a referência interna do processo (Nicomex) do texto de
 * `informacaoComplementar` da capa da DUIMP. Não existe campo estruturado
 * pra isso no Portal Único — é texto livre preenchido pelo despachante ao
 * registrar a DUIMP. Em vez de depender do rótulo "REFERENCIA......:" (que
 * pode variar), casa direto com o padrão fixo da referência:
 * "A" + ano (2 dígitos) + "-" + sigla do cliente (3 letras) + "-" +
 * filial+sequencial (6 dígitos), ex: "A26-NXT-016599".
 */
export function extrairReferenciaNicomexDaCapa(capa: DuimpCapa): string | null {
  const raw = capa.raw as { informacaoComplementar?: string } | undefined;
  const texto = raw?.informacaoComplementar ?? "";
  const match = /\bA\d{2}-[A-Z]{3}-\d{6}\b/.exec(texto);
  return match?.[0] ?? null;
}

/**
 * Diz se a DUIMP foi despachada pela Nicomex, procurando o marcador no
 * texto de `informacaoComplementar` (linha padrão que o despachante inclui
 * ao montar a DUIMP: "DECLARACAO DE IMPORTACAO REGISTRADA POR NCX ADUANA
 * GESTAO ADUANEIRA...").
 *
 * É o critério mais confiável que temos para "este despacho é nosso",
 * porque independe de quem apertou o botão de registrar: há clientes que
 * registram a DUIMP no CPF do próprio dono da empresa, ainda que o
 * processo todo tenha sido montado aqui.
 */
export function despachadaPelaNicomex(capa: DuimpCapa): boolean {
  const marcador = config.pucomex.marcadorDespachoProprio;
  if (!marcador) {
    return false;
  }
  const raw = capa.raw as { informacaoComplementar?: string } | undefined;
  return (raw?.informacaoComplementar ?? "").toUpperCase().includes(marcador.toUpperCase());
}

/**
 * Busca a carga no CCT pelo número do AWB para descobrir o ID interno usado
 * nos demais endpoints (ex: emissão de extrato). Endpoint e payload
 * confirmados via chamada real:
 * GET /ccta-backend/api/carga/consulta/{numeroAwb}?situacao=A
 * -> array de cargas, cada uma com o campo `idCarga`.
 */
/**
 * O CCT respondeu, mas não tem carga com esse número. É diferente de uma
 * falha de conexão: aqui vale tentar outro número para a mesma carga, e lá
 * não.
 */
export class CargaNaoEncontradaError extends Error {}

export async function buscarCargaPorAwb(
  numeroAwb: string,
): Promise<{ idCarga: string; raw: unknown }> {
  const data = await comRetentativas(`Busca da carga ${numeroAwb} no CCT`, async () => {
    const client = await httpClient();
    const response = await client.get(`/ccta-backend/api/carga/consulta/${numeroAwb}`, {
      params: { situacao: "A" },
    });
    return response.data;
  });
  const primeiraCarga = Array.isArray(data) ? data[0] : data;
  const idCarga = primeiraCarga?.idCarga;
  if (!idCarga) {
    throw new CargaNaoEncontradaError(
      `Não foi possível extrair o ID interno da carga para o AWB ${numeroAwb}. ` +
        `Resposta recebida: ${JSON.stringify(data)}`,
    );
  }
  return { idCarga: String(idCarga), raw: data };
}

/**
 * Emite o extrato em PDF do conhecimento de carga (equivalente ao botão
 * "Emitir Extrato" na tela do CCT) — confirmado via inspeção de rede real:
 * GET /ccta-backend/api/carga/{idCarga}/extrato -> application/pdf
 */
export function getCctExtratoPdf(idCarga: string): Promise<Buffer> {
  return comRetentativas(`Extrato do CCT (carga ${idCarga})`, async () => {
    const client = await httpClient();
    const response = await client.get(`/ccta-backend/api/carga/${idCarga}/extrato`, {
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  });
}
