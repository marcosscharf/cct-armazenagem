# cct-armazenagem

Automação da solicitação de cálculo de armazenagem junto ao terminal de
cargas aéreas do RioGaleão.

## Fluxo

1. Portal Único Siscomex notifica (webhook) quando um AWB é vinculado a uma
   DUIMP.
2. Este serviço recebe a notificação, busca o extrato da DUIMP e os dados de
   carga no CCT (via API do Portal Único, autenticando com Chave de Acesso).
3. Monta e envia por e-mail (Microsoft Graph) a solicitação de cálculo de
   armazenagem para a tarifação do RioGaleão, com os documentos em anexo.

## Status / pontos em aberto

Vários detalhes da integração com o Portal Único ainda **não foram
validados contra uma chamada real** — o ambiente onde este projeto foi
inicialmente montado não teve acesso à documentação nem a uma conta de
teste. Antes de rodar em produção, confirmar:

- `PUCOMEX_TOKEN_URL` e o formato exato da troca client id/secret por token
  (doc de Autenticação).
- Paths exatos dos endpoints de extrato de DUIMP e de consulta de carga no
  CCT (`src/portalUnico/client.ts`, marcados com `TODO`).
- Identificador exato do evento de "vinculação de conhecimento de carga a
  documento de saída" e o formato real do payload (`src/portalUnico/webhookTypes.ts`).
- Mecanismo real de validação da chamada de webhook recebida (a doc
  descreve `chaveSecreta`/`chaveAutenticacao` definidos na inscrição —
  hoje o código espera um header simples `x-pucomex-secret` como
  placeholder).
- Formato dos anexos enviados por e-mail: hoje o extrato/dados de carga vão
  como JSON bruto; provavelmente vale gerar PDF a partir dos dados.

## Setup local

```bash
npm install
cp .env.example .env   # preencher com as credenciais reais
npm run dev
```

O servidor sobe em `http://localhost:3000`. Endpoint de saúde: `GET /health`.

### Testando o webhook localmente

O Portal Único precisa conseguir chamar um endpoint HTTPS público. Para
testar localmente antes de ter um servidor:

```bash
npx ngrok http 3000
```

Use a URL HTTPS gerada pelo ngrok (`https://xxxx.ngrok.app/webhooks/portal-unico`)
ao inscrever o webhook na API do Portal Único. Depois, para produção, troque
por um domínio/servidor fixo — o código não muda, só a URL registrada na
inscrição e as variáveis de ambiente.

### Simulando um evento manualmente

```bash
curl -X POST http://localhost:3000/webhooks/portal-unico \
  -H "Content-Type: application/json" \
  -H "x-pucomex-secret: $PUCOMEX_WEBHOOK_SECRET" \
  -d '{
    "evento": "SUBSTITUIR_PELO_ID_REAL",
    "payload": {
      "tipoDocumentoCarga": "AWB",
      "numeroDocumentoCarga": "12345678901",
      "numeroDuimp": "26BR0000001234"
    }
  }'
```

## Deploy

Build de produção:

```bash
npm run build
npm start
```

Funciona como processo Node comum atrás de qualquer proxy HTTPS (nginx,
Azure App Service, Azure Functions com um adapter, etc.) — sem dependência
de nenhum serviço específico da nuvem.
