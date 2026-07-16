import axios, { AxiosInstance } from "axios";
import { config } from "../config";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/**
 * Troca o par Client-Id / Client-Secret (Chave de Acesso) por um token de
 * acesso, conforme docs.portalunico.siscomex.gov.br/api/plat/:
 * POST {authBaseUrl}/api/autenticar/chave-acesso
 * Headers: Client-Id, Client-Secret, Role-Type
 * O token vem no header `Set-Token` e também no corpo `{ "token": "..." }`.
 * A doc não especifica tempo de vida do token — cacheamos por um período
 * curto e conservador; ajustar se descobrirmos o valor real (ex: via
 * X-CSRF-Expiration, que é de outro token/CSRF, não deste).
 */
async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
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

  const accessToken: string = response.headers["set-token"] ?? response.data?.token;
  if (!accessToken) {
    throw new Error("Autenticação no Portal Único não retornou token (Set-Token/body.token)");
  }

  const cacheTtlSeconds = 4 * 60; // TODO: confirmar validade real do token
  tokenCache = { accessToken, expiresAt: Date.now() + cacheTtlSeconds * 1000 };

  return accessToken;
}

async function httpClient(): Promise<AxiosInstance> {
  const token = await getAccessToken();
  return axios.create({
    baseURL: config.pucomex.apiBaseUrl,
    // TODO: confirmar o header esperado pelos endpoints de negócio (duimp/cct)
    // para repassar o token de sessão — assumindo Authorization: Bearer por
    // ora; pode ser que esperem o mesmo header Set-Token/Authorization diferente.
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface DuimpExtrato {
  numeroDuimp: string;
  versaoDuimp: string;
  raw: unknown;
}

/**
 * Busca os itens da DUIMP. Endpoint confirmado via inspeção de rede real:
 * GET /duimp/api/duimp/extrato/{numeroDuimp}/{versaoDuimp}/itens?faixa-itens=1-128&cache=true
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
  const { data } = await client.get(
    `/duimp/api/duimp/extrato/${numeroDuimp}/${versaoDuimp}/itens`,
    { params: { "faixa-itens": "1-128", cache: true } },
  );
  return { numeroDuimp, versaoDuimp, raw: data };
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

export interface CctCarga {
  numeroAwb: string;
  raw: unknown;
}

/**
 * Busca os dados de carga/armazenagem no CCT vinculados a um AWB.
 * TODO: path ainda não confirmado contra uma chamada real — pegar do dev
 * tools do navegador (aba Rede, coluna "URL Da Solicitação") ao consultar um
 * AWB no CCT, do mesmo jeito que foi feito para a DUIMP.
 */
export async function getCctCarga(numeroAwb: string): Promise<CctCarga> {
  const client = await httpClient();
  const { data } = await client.get(`/cct/api/ext/priv/carga/${numeroAwb}`);
  return { numeroAwb, raw: data };
}
