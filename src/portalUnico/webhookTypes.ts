/**
 * Formato aproximado do payload de notificação de vinculação de conhecimento
 * de carga (AWB) a documento de saída (DUIMP), conforme descrito na doc de
 * eventos de DUIMP para intervenientes privados. Campos exatos (nomes/casing)
 * ainda precisam ser confirmados contra uma notificação real — ajustar assim
 * que a primeira chegar.
 */
export interface VinculacaoCargaEvent {
  evento: string;
  dataHoraEvento?: string;
  payload: {
    tipoDocumentoCarga?: string; // ex: "AWB"
    numeroDocumentoCarga?: string;
    numeroDuimp?: string;
    versaoDuimp?: string;
    cnpjResponsavel?: string;
    dataVinculacao?: string;
    [key: string]: unknown;
  };
}

export function isVinculacaoCargaEvent(body: unknown): body is VinculacaoCargaEvent {
  return (
    typeof body === "object" &&
    body !== null &&
    "evento" in body &&
    "payload" in body
  );
}
