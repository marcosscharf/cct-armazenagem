export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBytes: string; // base64
}

export interface SendCalculoArmazenagemEmailInput {
  numeroDuimp: string;
  numeroAwb: string;
  attachments: EmailAttachment[];
}
