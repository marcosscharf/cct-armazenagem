import { config } from "../config";
import { RotaRecinto } from "./types";

/**
 * Para onde vai a solicitação de cada DUIMP, conforme o recinto aduaneiro
 * (campo `urfDespacho.codigo` na capa da DUIMP).
 *
 * Esta tabela é também o **filtro de recinto**: DUIMP cujo recinto não
 * esteja aqui é ignorada. Antes existia uma lista separada
 * (`PUCOMEX_CODIGOS_RECINTO_AUTORIZADOS`) que precisava ser mantida em
 * sincronia com os destinos — se um recinto fosse acrescentado num lugar e
 * esquecido no outro, a automação ficava sem disparar em silêncio. Com uma
 * fonte única, isso não acontece.
 *
 * Para acrescentar um aeroporto: uma entrada aqui + a variável de ambiente
 * com os destinatários.
 */
function rotas(): RotaRecinto[] {
  return [
    {
      codigoRecinto: "0717700",
      nome: "RioGaleão",
      para: config.mail.toGaleao,
      saudacao: "Prezados,",
      introducao: "Solicitamos o cálculo de armazenagem referente à carga abaixo:",
    },
    {
      // Guarulhos não é enviado ao aeroporto: vai para o representante da
      // Nicomex em São Paulo, que faz a solicitação do DAI junto ao GRU.
      codigoRecinto: "0817600",
      nome: "Guarulhos",
      para: config.mail.toGuarulhos,
      saudacao: "Olá Marcos,",
      introducao: "Segue documentação para envio do DAI",
    },
  ];
}

/** Rota do recinto, ou null quando não há destino configurado para ele. */
export function rotaDoRecinto(codigoRecinto: string | null): RotaRecinto | null {
  if (!codigoRecinto) {
    return null;
  }
  return rotas().find((rota) => rota.codigoRecinto === codigoRecinto) ?? null;
}
