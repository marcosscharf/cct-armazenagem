import axios from "axios";

/**
 * Resume um erro em uma linha legível.
 *
 * Sem isso, logar um `AxiosError` despeja o objeto inteiro de request/response
 * — dezenas de linhas por falha, incluindo o cookie `JWTPCMX_USR` (o JWT da
 * sessão) em texto puro dentro dos headers. Além de ilegível, é credencial
 * gravada em arquivo de log.
 *
 * O que interessa quando algo falha é: qual chamada, qual status, e o que o
 * Portal Único respondeu (ele devolve `code`/`message` úteis, tipo
 * `DIMP-ER0102 - Duimp não registrada`).
 */
export function descreverErro(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const metodo = err.config?.method?.toUpperCase() ?? "?";
    const url = `${err.config?.baseURL ?? ""}${err.config?.url ?? ""}`;
    const status = err.response?.status ?? "sem resposta";
    const dados = err.response?.data as { code?: string; message?: string } | undefined;
    const detalhe = dados?.code || dados?.message
      ? ` — ${[dados?.code, dados?.message].filter(Boolean).join(": ")}`
      : ` — ${err.message}`;

    return `${metodo} ${url} respondeu ${status}${detalhe}`;
  }

  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
}
