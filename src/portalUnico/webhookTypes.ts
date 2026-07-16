/**
 * Formato aproximado do payload de notificação de registro de uma DUIMP
 * (evento `dimp-registro-import`). É esse evento que dispara quando a DUIMP
 * é registrada — o gatilho para solicitar o cálculo de armazenagem.
 *
 * Os nomes exatos dos campos ainda precisam ser confirmados contra uma
 * notificação real (basta capturar o corpo do primeiro POST recebido e
 * ajustar aqui). O AWB normalmente não vem no evento — é obtido depois, a
 * partir do extrato da DUIMP.
 */
export interface DuimpRegistroEvent {
  evento: string;
  dataHoraEvento?: string;
  payload: {
    numeroDuimp?: string;
    versaoDuimp?: string;
    cnpjResponsavel?: string;
    situacao?: string;
    [key: string]: unknown;
  };
}

export function isDuimpRegistroEvent(body: unknown): body is DuimpRegistroEvent {
  return (
    typeof body === "object" &&
    body !== null &&
    "evento" in body &&
    "payload" in body
  );
}
