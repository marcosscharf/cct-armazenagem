/**
 * Extração do número da DUIMP a partir do corpo das notificações de webhook
 * do Portal Único. Dois eventos são suportados:
 *
 * - `ccti-vinc-docto-saida` (Controle de Carga e Trânsito, "Vinculação de
 *   documento de saída") — **gatilho em uso**. Dispara quando a carga é
 *   vinculada ao documento de saída, o que acontece imediatamente ao
 *   registrar a DUIMP. É o evento escolhido porque `dimp-registro-import`
 *   já tem uma assinatura ativa de terceiros no Portal Único do usuário e
 *   só é permitida uma assinatura por evento.
 *
 * - `dimp-registro-import` (Declaração Única de Importação, "Resultado da
 *   solicitação de registro de uma Duimp") — mantido como alternativa, com
 *   o formato documentado oficialmente.
 */

/** Número de DUIMP sem pontuação: 2 dígitos de ano + "BR" + 11 dígitos. */
const PADRAO_NUMERO_DUIMP = /^\d{2}BR\d{11}$/;

/** Remove pontuação: "26BR0001338512-8" -> "26BR00013385128". */
export function normalizarNumeroDuimp(valor: string): string {
  return valor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Formato documentado do evento `dimp-registro-import`. */
export interface DuimpRegistroEvent {
  registroIniciado?: boolean;
  code?: string;
  message?: string;
  identificacao: { numero: string; versao?: string };
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

/** Coleta recursivamente todos os valores string de um objeto/array. */
function coletarStrings(valor: unknown, acumulador: string[] = []): string[] {
  if (typeof valor === "string") {
    acumulador.push(valor);
  } else if (Array.isArray(valor)) {
    valor.forEach((item) => coletarStrings(item, acumulador));
  } else if (typeof valor === "object" && valor !== null) {
    Object.values(valor).forEach((item) => coletarStrings(item, acumulador));
  }
  return acumulador;
}

/**
 * Payload real do evento `ccti-vinc-docto-saida`, confirmado em eventos
 * recebidos em produção:
 *
 * {
 *   "tipoDocumentoSaida": "DUIMP",
 *   "numeroDocumentoSaida": "26BR0001344756-5",
 *   "identificacaoCarga": "4001908000",
 *   "dataEmissaoCarga": "09/07/2026 14:58 (UTC +10:00)",
 *   "cnpjResponsavelArquivoCarga": "42584342000146",
 *   "dataHoraVinculacao": "03/08/2026 17:26:18"
 * }
 */
export interface CctVinculacaoDocumentoSaidaEvent {
  tipoDocumentoSaida?: string;
  numeroDocumentoSaida?: string;
  identificacaoCarga?: string;
  dataEmissaoCarga?: string;
  cnpjResponsavelArquivoCarga?: string;
  dataHoraVinculacao?: string;
}

/**
 * Extrai o número da DUIMP do evento `ccti-vinc-docto-saida`.
 *
 * Lê os campos nomeados do payload real e ignora vinculações cujo documento
 * de saída não seja DUIMP (DI do sistema antigo está fora do escopo desta
 * automação).
 *
 * Como fallback, mantém a busca pelo **formato** do número varrendo o
 * payload — número de DUIMP tem um padrão inconfundível
 * (`26BR00013447565`) que nenhum outro campo do evento reproduz. Assim, se
 * o Portal Único renomear campos, a automação continua funcionando.
 */
export function extrairNumeroDuimpDeVinculacaoCarga(body: unknown): string | null {
  const evento = (body ?? {}) as CctVinculacaoDocumentoSaidaEvent;

  if (evento.tipoDocumentoSaida && evento.tipoDocumentoSaida.toUpperCase() !== "DUIMP") {
    return null;
  }

  if (evento.numeroDocumentoSaida) {
    const numero = normalizarNumeroDuimp(evento.numeroDocumentoSaida);
    if (PADRAO_NUMERO_DUIMP.test(numero)) {
      return numero;
    }
  }

  const candidato = coletarStrings(body)
    .map(normalizarNumeroDuimp)
    .find((valor) => PADRAO_NUMERO_DUIMP.test(valor));

  return candidato ?? null;
}

/**
 * Descobre o número da DUIMP a partir do evento recebido, de acordo com o
 * tipo informado no header `event-type`. Retorna null quando o evento não
 * diz respeito a uma DUIMP (ex: vinculação de uma DI).
 */
export function extrairNumeroDuimpDoEvento(
  eventType: string | undefined,
  body: unknown,
): string | null {
  if (eventType === "ccti-vinc-docto-saida") {
    return extrairNumeroDuimpDeVinculacaoCarga(body);
  }

  if (isDuimpRegistroEvent(body)) {
    return normalizarNumeroDuimp(body.identificacao.numero);
  }

  return null;
}
