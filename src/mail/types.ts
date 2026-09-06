export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBytes: string; // base64
}

/**
 * Destino da solicitação para um recinto aduaneiro: quem recebe e como o
 * e-mail se dirige a essa pessoa. O RioGaleão recebe o pedido de cálculo
 * direto; Guarulhos vai para o representante da Nicomex em São Paulo, que
 * solicita o DAI ao aeroporto.
 */
export interface RotaRecinto {
  codigoRecinto: string;
  /** Nome do destino, usado no log. */
  nome: string;
  para: string[];
  /** Primeira linha do corpo, ex: "Prezados," / "Olá Marcos,". */
  saudacao: string;
  /** Linha que explica o pedido, logo abaixo da saudação. */
  introducao: string;
}

export interface SendCalculoArmazenagemEmailInput {
  numeroDuimp: string;
  numeroAwb: string;
  nomeImportador: string | null;
  referenciaNicomex: string | null;
  cnpjPagador: string | null;
  rota: RotaRecinto;
  attachments: EmailAttachment[];
}
