import axios, { AxiosInstance } from "axios";
import { config } from "../config";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/**
 * Troca o par client id / client secret (Chave de Acesso) por um token de
 * acesso à API do Portal Único. Endpoint e formato exatos ainda precisam ser
 * confirmados na doc de Autenticação (docs.portalunico.siscomex.gov.br/api/plat/)
 * — o fetch direto da doc está bloqueado neste ambiente, então isso não foi
 * validado contra uma chamada real ainda.
 */
async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  const response = await axios.post(config.pucomex.tokenUrl, {
    clientId: config.pucomex.clientId,
    clientSecret: config.pucomex.clientSecret,
  });

  const accessToken: string = response.data.accessToken ?? response.data.access_token;
  const expiresInSeconds: number = response.data.expiresIn ?? response.data.expires_in ?? 3600;

  tokenCache = {
    accessToken,
    expiresAt: Date.now() + (expiresInSeconds - 60) * 1000,
  };

  return accessToken;
}

async function httpClient(): Promise<AxiosInstance> {
  const token = await getAccessToken();
  return axios.create({
    baseURL: config.pucomex.apiBaseUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface DuimpExtrato {
  numeroDuimp: string;
  versaoDuimp?: string;
  raw: unknown;
}

/**
 * Busca o extrato/dados da DUIMP.
 * TODO: confirmar path exato do endpoint (swagger duimp-api.html).
 */
export async function getDuimpExtrato(numeroDuimp: string): Promise<DuimpExtrato> {
  const client = await httpClient();
  const { data } = await client.get(`/duimp/api/ext/priv/duimp/${numeroDuimp}/extrato`);
  return { numeroDuimp, raw: data };
}

/**
 * Extrai o(s) número(s) de AWB do extrato da DUIMP.
 * TODO: confirmar em que campo do extrato o AWB aparece (documento de carga /
 * conhecimento). Por ora faz uma busca defensiva por campos prováveis.
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
 * TODO: confirmar path exato do endpoint (docs.portalunico.siscomex.gov.br/api/ccta ou /api/cctr).
 */
export async function getCctCarga(numeroAwb: string): Promise<CctCarga> {
  const client = await httpClient();
  const { data } = await client.get(`/cct/api/ext/priv/carga/${numeroAwb}`);
  return { numeroAwb, raw: data };
}
