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
    // Base do serviço de autenticação (docs.portalunico.siscomex.gov.br/api/plat/):
    // POST {authBaseUrl}/api/autenticar/chave-acesso
    authBaseUrl: process.env.PUCOMEX_AUTH_BASE_URL ?? "https://portalunico.siscomex.gov.br/portal",
    // Base dos módulos de negócio (duimp, cct, ...) — confirmado via inspeção
    // de rede real que fica direto na raiz do domínio, sem o prefixo /portal.
    apiBaseUrl: process.env.PUCOMEX_API_BASE_URL ?? "https://portalunico.siscomex.gov.br",
    clientId: process.env.PUCOMEX_CLIENT_ID ?? "",
    clientSecret: process.env.PUCOMEX_CLIENT_SECRET ?? "",
    // Perfil de atuação (header Role-Type) usado na autenticação — ver tabela
    // "Perfis de Acesso" na doc de Autenticação (ex: TERCEIROS, AGECARGA...).
    roleType: process.env.PUCOMEX_ROLE_TYPE ?? "",

    // Segredo combinado no momento da inscrição do webhook (chaveSecreta),
    // usado para validar que a chamada recebida realmente veio do Portal Único.
    webhookSecret: process.env.PUCOMEX_WEBHOOK_SECRET ?? "",

    // Identificadores dos eventos de interesse. O gatilho é
    // `dimp-registro-import` (DUIMP registrada). Configurável por env para não
    // exigir deploy ao ajustar.
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
