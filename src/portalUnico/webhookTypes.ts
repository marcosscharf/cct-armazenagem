/**
 * Formato real do payload de notificação de registro de uma DUIMP (evento
 * `dimp-registro-import`), confirmado na documentação oficial
 * (docs.portalunico.siscomex.gov.br/pages/duimp_eventos_intervenientes_privados/,
 * seção "Resultado da solicitação de registro de uma Duimp"). Os campos
 * vêm direto na raiz do corpo, sem wrapper — o identificador técnico do
 * evento (`dimp-registro-import`) não vem no corpo, só no header
 * `event-type` da requisição (ver `webhookRouter.ts`). O AWB não vem no
 * evento — é obtido depois, a partir do extrato da DUIMP.
 */
export interface DuimpIdentificacao {
  numero: string;
  versao: string;
}

export interface DuimpRegistroEvent {
  registroIniciado?: boolean;
  code?: string;
  message?: string;
  identificacao: DuimpIdentificacao;
  niImportador?: string;
  situacaoDuimp?: string;
  evento?: string[];
  dataEvento?: string;
  diagnostico?: { situacao?: string; dataGeracao?: string };
  linkConsulta?: { method?: string; url?: string };
}

export function isDuimpRegistroEvent(body: unknown): body is DuimpRegistroEvent {
  if (typeof body !== "object" || body === null || !("identificacao" in body)) {
    return false;
  }
  const identificacao = (body as { identificacao?: unknown }).identificacao;
  return (
    typeof identificacao === "object" &&
    identificacao !== null &&
    typeof (identificacao as { numero?: unknown }).numero === "string"
  );
}
