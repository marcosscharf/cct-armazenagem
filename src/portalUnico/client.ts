import axios, { AxiosInstance } from "axios";
import { config } from "../config";

interface Session {
  jwt: string;
  csrfToken: string;
  expiresAt: number;
}

let sessionCache: Session | null = null;

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
async function authenticate(): Promise<Session> {
  if (sessionCache && sessionCache.expiresAt > Date.now() + 5_000) {
    return sessionCache;
  }

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

export interface DuimpExtrato {
  numeroDuimp: string;
  versaoDuimp: string;
  raw: unknown;
}

/**
 * Busca os itens da DUIMP. Endpoint e autenticação confirmados via chamada
 * real: GET /duimp/api/duimp/extrato/{numeroDuimp}/{versaoDuimp}/itens
 *
 * A API valida a faixa de itens contra a quantidade real de itens da DUIMP e
 * retorna 422 (`DIMP-ER0100`) se pedirmos além do último item existente —
 * como não sabemos de antemão quantos itens a DUIMP tem, tentamos uma faixa
 * generosa e, se cair nesse erro, extraímos o limite real da mensagem e
 * tentamos de novo.
 *
 * TODO: confirmar se existe um endpoint separado para os dados de "capa" da
 * DUIMP (importador, documentos de carga vinculados etc) além dos itens —
 * este aqui traz a lista de produtos/NCM, que pode não conter o AWB.
 */
export async function getDuimpExtrato(
  numeroDuimp: string,
  versaoDuimp = "0001",
): Promise<DuimpExtrato> {
  const client = await httpClient();

  const buscarItens = (faixaItens: string) =>
    client.get(`/duimp/api/duimp/extrato/${numeroDuimp}/${versaoDuimp}/itens`, {
      params: { "faixa-itens": faixaItens, cache: true },
    });

  try {
    const { data } = await buscarItens("1-999");
    return { numeroDuimp, versaoDuimp, raw: data };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 422) {
      const mensagem: string = err.response.data?.message ?? "";
      const match = /último item ativo:\s*(\d+)/i.exec(mensagem);
      if (match) {
        const { data } = await buscarItens(`1-${match[1]}`);
        return { numeroDuimp, versaoDuimp, raw: data };
      }
    }
    throw err;
  }
}

/**
 * Extrai o(s) número(s) de AWB do extrato da DUIMP.
 * TODO: confirmar em que campo do extrato o AWB aparece (documento de carga /
 * conhecimento) — o endpoint de itens pode não trazer esse dado; nesse caso
 * será preciso um endpoint de "capa"/documentos de carga da DUIMP.
 */
export function extrairAwbsDoExtrato(extrato: DuimpExtrato): string[] {
  const encontrados = new Set<string>();
  const visitar = (node: unknown): void => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(visitar);
      return;
    }
    if (typeof node === "object") {
      for (const [chave, valor] of Object.entries(node as Record<string, unknown>)) {
        const c = chave.toLowerCase();
        if ((c.includes("awb") || c.includes("conhecimento") || c.includes("documentocarga")) &&
            typeof valor === "string" && valor.trim()) {
          encontrados.add(valor.trim());
        }
        visitar(valor);
      }
    }
  };
  visitar(extrato.raw);
  return [...encontrados];
}

/**
 * Busca a carga no CCT pelo número do AWB para descobrir o ID interno usado
 * nos demais endpoints (ex: emissão de extrato). Endpoint confirmado via
 * inspeção de rede real:
 * GET /ccta-backend/api/carga/consulta/{numeroAwb}?situacao=A
 * TODO: confirmar em que campo do JSON de resposta vem o ID interno (estamos
 * assumindo `id`/`idCarga`, ainda não visto num payload real).
 */
export async function buscarCargaPorAwb(
  numeroAwb: string,
): Promise<{ idCarga: string; raw: unknown }> {
  const client = await httpClient();
  const { data } = await client.get(`/ccta-backend/api/carga/consulta/${numeroAwb}`, {
    params: { situacao: "A" },
  });
  const idCarga = data?.id ?? data?.idCarga;
  if (!idCarga) {
    throw new Error(`Não foi possível extrair o ID interno da carga para o AWB ${numeroAwb}`);
  }
  return { idCarga: String(idCarga), raw: data };
}

/**
 * Emite o extrato em PDF do conhecimento de carga (equivalente ao botão
 * "Emitir Extrato" na tela do CCT) — confirmado via inspeção de rede real:
 * GET /ccta-backend/api/carga/{idCarga}/extrato -> application/pdf
 */
export async function getCctExtratoPdf(idCarga: string): Promise<Buffer> {
  const client = await httpClient();
  const response = await client.get(`/ccta-backend/api/carga/${idCarga}/extrato`, {
    responseType: "arraybuffer",
  });
  return Buffer.from(response.data);
}
