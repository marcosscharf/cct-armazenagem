import { SendCalculoArmazenagemEmailInput } from "./types";
import { formatarCnpj, formatarNumeroDuimp } from "../portalUnico/format";

/**
 * Padrão de assunto exigido pelo terminal de cargas do RioGaleão:
 * "DUIMP <número> // <cliente> (<referência Nicomex>) // SOLICITAÇÃO DE CÁLCULO"
 */
export function buildSubject(input: SendCalculoArmazenagemEmailInput): string {
  const numero = formatarNumeroDuimp(input.numeroDuimp);
  const cliente = input.nomeImportador?.trim().split(/\s+/)[0] ?? "";
  const referencia = input.referenciaNicomex ? ` (${input.referenciaNicomex})` : " (REF NÃO ENCONTRADA)";
  return `DUIMP ${numero} // ${cliente}${referencia} // SOLICITAÇÃO DE CÁLCULO`;
}

export function buildBody(input: SendCalculoArmazenagemEmailInput): string {
  const linhas = [
    "Prezados,",
    "",
    "Solicitamos o cálculo de armazenagem referente à carga abaixo:",
    "",
    `AWB: ${input.numeroAwb}`,
    `DUIMP: ${formatarNumeroDuimp(input.numeroDuimp)}`,
  ];

  if (input.cnpjPagador) {
    linhas.push(`CNPJ pagador ${formatarCnpj(input.cnpjPagador)}`);
  }

  linhas.push(
    "",
    "Segue em anexo o extrato da DUIMP e os dados do CCT vinculados.",
    "",
    "Solicitação gerada automaticamente.",
  );

  return linhas.join("\n");
}

/**
 * Versão HTML do corpo — usada no envio de verdade (Graph e SMTP) pra
 * poder destacar a linha "CNPJ pagador" em negrito e amarelo, o que texto
 * puro não permite. `buildBody` continua sendo a versão texto (log de
 * DRY_RUN e fallback multipart no SMTP).
 */
export function buildHtmlBody(input: SendCalculoArmazenagemEmailInput): string {
  const linhaCnpjPagador = input.cnpjPagador
    ? `<p><strong style="background-color:#FFFF00;">CNPJ pagador ${formatarCnpj(input.cnpjPagador)}</strong></p>`
    : "";

  return (
    `<p>Prezados,</p>` +
    `<p>Solicitamos o cálculo de armazenagem referente à carga abaixo:</p>` +
    `<p>AWB: ${input.numeroAwb}<br>DUIMP: ${formatarNumeroDuimp(input.numeroDuimp)}</p>` +
    linhaCnpjPagador +
    `<p>Segue em anexo o extrato da DUIMP e os dados do CCT vinculados.</p>` +
    `<p>Solicitação gerada automaticamente.</p>`
  );
}
