export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBytes: string; // base64
}

export interface SendCalculoArmazenagemEmailInput {
  numeroDuimp: string;
  numeroAwb: string;
  nomeImportador: string | null;
  referenciaNicomex: string | null;
  cnpjPagador: string | null;
  attachments: EmailAttachment[];
}
