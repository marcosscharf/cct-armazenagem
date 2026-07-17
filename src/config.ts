import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

// Formato: "CNPJ_do_cliente:CNPJ_pagador;CNPJ_do_cliente2:CNPJ_pagador2".
// Alguns clientes pedem que a fatura de armazenagem saia contra um CNPJ
// diferente do CNPJ do importador na DUIMP (ex: outra filial do grupo).
function parseCnpjPagadorOverrides(raw: string | undefined): Record<string, string> {
  const pares = (raw ?? "")
    .split(";")
    .map((par) => par.trim())
    .filter(Boolean);

  const mapa: Record<string, string> = {};
  for (const par of pares) {
    const [origem, pagador] = par.split(":").map((valor) => (valor ?? "").replace(/\D/g, ""));
    if (origem && pagador) {
      mapa[origem] = pagador;
    }
  }
  return mapa;
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

    // "Chave secreta" preenchida no momento da inscrição do webhook — o
    // Portal Único a envia de volta no header `Secret` de cada chamada de
    // notificação, usada aqui para validar que a chamada é legítima.
    webhookSecret: process.env.PUCOMEX_WEBHOOK_SECRET ?? "",

    // Identificadores dos eventos de interesse. O gatilho é
    // `dimp-registro-import` (DUIMP registrada). Configurável por env para não
    // exigir deploy ao ajustar.
    watchedEventIds: (process.env.PUCOMEX_WATCHED_EVENT_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),

    // CPFs (só dígitos) dos despachantes cujas DUIMPs devem disparar a
    // automação — comparado com `responsavelRegistroNumero` na capa da
    // DUIMP. Existe acesso de visualização a DUIMPs de clientes cujo
    // despacho é feito por outra pessoa; sem esse filtro, a automação
    // dispararia também para processos que não são seus. Vazio = sem
    // filtro (processa qualquer declarante).
    cpfsResponsaveisAutorizados: (process.env.PUCOMEX_CPFS_RESPONSAVEIS_AUTORIZADOS ?? "")
      .split(",")
      .map((cpf) => cpf.replace(/\D/g, ""))
      .filter(Boolean),

    // Códigos de recinto/URF de despacho (campo `urfDespacho.codigo` na capa
    // da DUIMP) para os quais a automação deve disparar — comparado com o
    // recinto aduaneiro da DUIMP. O e-mail de armazenagem só faz sentido
    // para cargas no terminal do RioGaleão (código "0717700"); sem esse
    // filtro, DUIMPs de outros aeroportos/recintos também disparariam o
    // e-mail para a tarifação errada. Vazio = sem filtro (processa qualquer
    // recinto).
    codigosRecintoAutorizados: (process.env.PUCOMEX_CODIGOS_RECINTO_AUTORIZADOS ?? "")
      .split(",")
      .map((codigo) => codigo.trim())
      .filter(Boolean),

    // Casos em que a fatura de armazenagem deve sair contra um CNPJ
    // diferente do CNPJ do importador na DUIMP (ex: cliente PERENCO — CNPJ
    // do importador 09.309.027/0003-05, mas quem deve ser cobrado é o CNPJ
    // 09.309.027/0004-88). Chave e valor só dígitos. Vazio = nenhum
    // cliente com CNPJ pagador diferente.
    cnpjPagadorOverrides: parseCnpjPagadorOverrides(process.env.PUCOMEX_CNPJ_PAGADOR_OVERRIDES),
  },

  graph: {
    tenantId: process.env.GRAPH_TENANT_ID ?? "",
    clientId: process.env.GRAPH_CLIENT_ID ?? "",
    clientSecret: process.env.GRAPH_CLIENT_SECRET ?? "",
  },

  // Envio via SMTP genérico (ex: Gmail + "senha de app") — alternativa ao
  // Graph só para testar o envio localmente sem depender do app registration.
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    // false = não valida o certificado TLS do servidor SMTP. Necessário em
    // redes corporativas que interceptam TLS (antivírus/proxy). Padrão
    // true (seguro); só desative para teste local.
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
  },

  mail: {
    // "graph" (produção) ou "smtp" (teste local com conta pessoal).
    provider: process.env.MAIL_PROVIDER === "smtp" ? "smtp" : "graph",
    from: process.env.MAIL_FROM ?? "",
    toTarifacao: process.env.MAIL_TO_TARIFACAO ?? "",
    cc: (process.env.MAIL_CC ?? "")
      .split(",")
      .map((addr) => addr.trim())
      .filter(Boolean),
    // Modo de teste: loga o e-mail que seria enviado em vez de enviar de
    // verdade. Útil para testar o fluxo Portal Único -> anexos sem enviar
    // nada ainda, nem via Graph nem via SMTP.
    dryRun: process.env.DRY_RUN === "true",
  },
};

export { required };
