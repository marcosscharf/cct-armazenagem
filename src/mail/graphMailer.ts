import "isomorphic-fetch";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { config } from "../config";

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

function graphClient(): Client {
  const credential = new ClientSecretCredential(
    config.graph.tenantId,
    config.graph.clientId,
    config.graph.clientSecret,
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return Client.initWithMiddleware({ authProvider });
}

export async function sendCalculoArmazenagemEmail(
  input: SendCalculoArmazenagemEmailInput,
): Promise<void> {
  const client = graphClient();

  const message = {
    subject: `Solicitação de cálculo de armazenagem — AWB ${input.numeroAwb} / DUIMP ${input.numeroDuimp}`,
    body: {
      contentType: "Text",
      content:
        `Prezados,\n\n` +
        `Solicitamos o cálculo de armazenagem referente à carga abaixo:\n\n` +
        `AWB: ${input.numeroAwb}\n` +
        `DUIMP: ${input.numeroDuimp}\n\n` +
        `Segue em anexo o extrato da DUIMP e os dados do CCT vinculados.\n\n` +
        `Solicitação gerada automaticamente.`,
    },
    toRecipients: [{ emailAddress: { address: config.mail.toTarifacao } }],
    ccRecipients: config.mail.cc.map((address) => ({ emailAddress: { address } })),
    attachments: input.attachments.map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.filename,
      contentType: attachment.contentType,
      contentBytes: attachment.contentBytes,
    })),
  };

  await client.api(`/users/${config.mail.from}/sendMail`).post({ message });
}
