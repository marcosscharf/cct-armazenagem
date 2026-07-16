import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),

  pucomex: {
    // TODO: confirmar URL exata do endpoint de token na doc de Autenticação
    // (https://docs.portalunico.siscomex.gov.br/api/plat/) — o par
    // client id / client secret é gerado em "Chaves de Acesso"
    // (https://docs.portalunico.siscomex.gov.br/pages/chaves-acesso/).
    tokenUrl: process.env.PUCOMEX_TOKEN_URL ?? "",
    apiBaseUrl: process.env.PUCOMEX_API_BASE_URL ?? "https://portalunico.siscomex.gov.br",
    clientId: process.env.PUCOMEX_CLIENT_ID ?? "",
    clientSecret: process.env.PUCOMEX_CLIENT_SECRET ?? "",

    // Segredo combinado no momento da inscrição do webhook (chaveSecreta),
    // usado para validar que a chamada recebida realmente veio do Portal Único.
    webhookSecret: process.env.PUCOMEX_WEBHOOK_SECRET ?? "",

    // Identificadores dos eventos de interesse (vinculação de conhecimento de
    // carga/AWB a documento de saída/DUIMP). Configurável para não exigir
    // deploy ao ajustar depois de confirmar o catálogo oficial de eventos.
    watchedEventIds: (process.env.PUCOMEX_WATCHED_EVENT_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  },

  graph: {
    tenantId: process.env.GRAPH_TENANT_ID ?? "",
    clientId: process.env.GRAPH_CLIENT_ID ?? "",
    clientSecret: process.env.GRAPH_CLIENT_SECRET ?? "",
  },

  mail: {
    from: process.env.MAIL_FROM ?? "",
    toTarifacao: process.env.MAIL_TO_TARIFACAO ?? "",
    cc: (process.env.MAIL_CC ?? "")
      .split(",")
      .map((addr) => addr.trim())
      .filter(Boolean),
  },
};

export { required };
