import { SendCalculoArmazenagemEmailInput } from "./types";

export function buildSubject(input: SendCalculoArmazenagemEmailInput): string {
  return `Solicitação de cálculo de armazenagem — AWB ${input.numeroAwb} / DUIMP ${input.numeroDuimp}`;
}

export function buildBody(input: SendCalculoArmazenagemEmailInput): string {
  return (
    `Prezados,\n\n` +
    `Solicitamos o cálculo de armazenagem referente à carga abaixo:\n\n` +
    `AWB: ${input.numeroAwb}\n` +
    `DUIMP: ${input.numeroDuimp}\n\n` +
    `Segue em anexo o extrato da DUIMP e os dados do CCT vinculados.\n\n` +
    `Solicitação gerada automaticamente.`
  );
}
