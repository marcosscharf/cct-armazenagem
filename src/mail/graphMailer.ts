import "isomorphic-fetch";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { config } from "../config";
import { SendCalculoArmazenagemEmailInput } from "./types";
import { buildSubject, buildHtmlBody } from "./message";

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
    subject: buildSubject(input),
    body: { contentType: "HTML", content: buildHtmlBody(input) },
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
