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

Confirmado via testes reais (curl + inspeção de rede do navegador):

- Autenticação: `POST {authBaseUrl}/api/autenticar/chave-acesso` com headers
  `Client-Id`/`Client-Secret`/`Role-Type: IMPEXP`.
- Sessão: os módulos de negócio (duimp/ccta) **não** usam
  `Authorization: Bearer` — usam cookie `JWTPCMX_USR` (JWT do header
  `Set-Token`) + header `X-Csrf-Token`.
- Itens da DUIMP: `GET /duimp/api/duimp/extrato/{numeroDuimp}/{versaoDuimp}/itens`,
  com retry automático em caso de faixa de itens inválida (erro `DIMP-ER0100`).
- Evento gatilho: `dimp-registro-import` (resultado da solicitação de
  registro de uma DUIMP) — já inscrito no Portal Único do usuário.
- CCT: `GET /ccta-backend/api/carga/consulta/{numeroAwb}?situacao=A` busca o
  ID interno da carga; `GET /ccta-backend/api/carga/{idCarga}/extrato` emite
  o PDF do extrato do conhecimento de carga (usado como anexo do e-mail).

Ainda em aberto:

- Em que campo do JSON de itens da DUIMP aparece o AWB
  (`extrairAwbsDoExtrato` em `src/portalUnico/client.ts`) — o endpoint de
  itens pode não trazer esse dado, exigindo um endpoint de "capa" da DUIMP
  ainda não identificado. O extrato da DUIMP hoje vai anexado como JSON
  bruto; se existir um extrato em PDF da DUIMP (como existe no CCT), trocar
  para ele.
- Em que campo do JSON de `buscarCargaPorAwb` vem o ID interno da carga
  (assumindo `id`/`idCarga`, ainda não visto num payload real).
- Formato exato dos nomes de campo do payload real do webhook
  `dimp-registro-import` (`src/portalUnico/webhookTypes.ts`).
- Mecanismo real de validação da chamada de webhook recebida (a doc
  descreve `chaveSecreta`/`chaveAutenticacao` definidos na inscrição —
  hoje o código espera um header simples `x-pucomex-secret` como
  placeholder).

**Nota**: o ambiente onde este projeto é desenvolvido bloqueia acesso de
rede a `portalunico.siscomex.gov.br` — os testes acima foram feitos rodando
os comandos manualmente na máquina do usuário, não automatizados aqui. Todo
teste de ponta a ponta (`npm run dev` de verdade) precisa rodar numa máquina
com acesso normal à internet.

## Setup local

```bash
npm install
cp .env.example .env   # preencher com as credenciais reais
npm run dev
```

O servidor sobe em `http://localhost:3000`. Endpoint de saúde: `GET /health`.

Para testar o fluxo Portal Único → anexos sem precisar do Microsoft Graph
configurado ainda, deixe `DRY_RUN=true` no `.env` — o e-mail não é enviado de
verdade, só logado no console (destinatário, assunto, nome/tamanho dos
anexos).

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
