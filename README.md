# cct-armazenagem

Automação da solicitação de cálculo de armazenagem junto ao terminal de
cargas aéreas do RioGaleão.

## Fluxo

1. Portal Único Siscomex notifica (webhook) quando uma DUIMP é registrada
   (evento `dimp-registro-import`).
2. Este serviço recebe a notificação, pega o número da DUIMP, busca o extrato
   da DUIMP, descobre o AWB a partir do extrato e busca os dados de carga no
   CCT (via API do Portal Único, autenticando com Chave de Acesso).
3. Monta e envia por e-mail (Microsoft Graph) a solicitação de cálculo de
   armazenagem para a tarifação do RioGaleão, com os documentos em anexo.

## Status / pontos em aberto

Vários detalhes da integração com o Portal Único ainda **não foram
validados contra uma chamada real** — o ambiente onde este projeto foi
inicialmente montado não teve acesso à documentação nem a uma conta de
teste. Antes de rodar em produção, confirmar:

- Autenticação confirmada: `POST {authBaseUrl}/api/autenticar/chave-acesso`
  com headers `Client-Id`/`Client-Secret`/`Role-Type` (doc oficial). Falta
  confirmar: qual `Role-Type` usar, e qual header os endpoints de negócio
  (duimp/ccta) esperam para repassar o token (hoje assumindo
  `Authorization: Bearer`, não confirmado).
- Itens da DUIMP confirmados via inspeção de rede real: `GET
  /duimp/api/duimp/extrato/{numeroDuimp}/{versaoDuimp}/itens`. Falta
  confirmar em que campo aparece o AWB (`extrairAwbsDoExtrato` em
  `src/portalUnico/client.ts`) — o endpoint de itens pode não trazer esse
  dado, exigindo um endpoint de "capa" da DUIMP ainda não identificado. O
  extrato da DUIMP hoje vai anexado como JSON bruto; se existir um extrato em
  PDF da DUIMP (como existe no CCT), trocar para ele.
- Evento gatilho confirmado: `dimp-registro-import` (resultado da solicitação
  de registro de uma DUIMP) — já inscrito no Portal Único do usuário. Falta
  confirmar o formato exato dos nomes de campo do payload real
  (`src/portalUnico/webhookTypes.ts`).
- CCT: confirmado que `GET /ccta-backend/api/carga/{idCarga}/extrato` emite o
  PDF do extrato do conhecimento de carga (usado como anexo do e-mail). Falta
  confirmar o endpoint que traduz número do AWB → `idCarga` interno
  (`buscarCargaPorAwb` em `src/portalUnico/client.ts`).
- Mecanismo real de validação da chamada de webhook recebida (a doc
  descreve `chaveSecreta`/`chaveAutenticacao` definidos na inscrição —
  hoje o código espera um header simples `x-pucomex-secret` como
  placeholder).

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
    "evento": "dimp-registro-import",
    "payload": {
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
