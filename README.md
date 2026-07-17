# cct-armazenagem

Automação da solicitação de cálculo de armazenagem junto ao terminal de
cargas aéreas do RioGaleão.

## Fluxo

1. Portal Único Siscomex notifica (webhook) quando uma DUIMP é registrada
   (evento `dimp-registro-import`).
2. Este serviço recebe a notificação, pega o número da DUIMP, busca a capa e
   os itens da DUIMP, descobre o AWB (Conhecimento de Embarque) e busca os
   dados de carga no CCT (via API do Portal Único, autenticando com Chave de
   Acesso).
3. Monta e envia por e-mail a solicitação de cálculo de armazenagem para a
   tarifação do RioGaleão, com os documentos em anexo. Em produção via
   Microsoft Graph (`MAIL_PROVIDER=graph`); para testar localmente sem
   depender do app registration, dá para usar SMTP genérico
   (`MAIL_PROVIDER=smtp`, ex: Gmail com senha de app).

## Status / pontos em aberto

Confirmado via testes reais (curl + inspeção de rede do navegador):

- Autenticação: `POST {authBaseUrl}/api/autenticar/chave-acesso` com headers
  `Client-Id`/`Client-Secret`/`Role-Type: IMPEXP`.
- Sessão: os módulos de negócio (duimp/ccta) **não** usam
  `Authorization: Bearer` — usam cookie `JWTPCMX_USR` (JWT do header
  `Set-Token`) + header `X-Csrf-Token`.
- Capa da DUIMP: `GET /duimp/api/duimp/{numeroDuimp}/consulta?cache=true` —
  payload real confirmado. O AWB vem em `documentosInstrucao` (item com
  `tipo.codigo === "30"`, palavra-chave "Número"). O campo
  `informacaoComplementar` já traz um resumo textual completo (fatura,
  conhecimento, valores, tributos, despachantes).
- Evento gatilho: `dimp-registro-import` (resultado da solicitação de
  registro de uma DUIMP) — já inscrito no Portal Único do usuário.
- CCT: `GET /ccta-backend/api/carga/consulta/{numeroAwb}?situacao=A` retorna
  um array de cargas, cada uma com o campo `idCarga`; `GET
  /ccta-backend/api/carga/{idCarga}/extrato` emite o PDF do extrato do
  conhecimento de carga (usado como anexo do e-mail).
- Itens da DUIMP: `GET /duimp/api/duimp/extrato/{numeroDuimp}/{versaoDuimp}/itens`
  — traz produto, NCM, fabricante, exportador e tributos por item, com o
  mesmo retry automático de faixa de itens usado no endpoint de capa.
- Extrato da DUIMP: **não existe endpoint de servidor que gere PDF** — o
  botão "Gerar Extrato" na tela monta o PDF no navegador (client-side), a
  partir dos mesmos dados da capa + itens. Por isso o anexo de extrato da
  DUIMP no e-mail é gerado localmente (`src/portalUnico/duimpExtratoPdf.ts`,
  via `pdfkit`), replicando o layout do PDF oficial: Identificação, Carga,
  Histórico e uma página por item (produto, fabricante, exportador,
  tributos).

Também implementado: a automação só processa DUIMPs cujo
`responsavelRegistroNumero` esteja em `PUCOMEX_CPFS_RESPONSAVEIS_AUTORIZADOS`
— necessário porque o Portal Único mostra DUIMPs de clientes cujo despacho é
feito por outra pessoa, não só as que o usuário mesmo registrou.

Também implementado: a automação só processa DUIMPs cujo recinto aduaneiro
(campo `urfDespacho.codigo` da capa) esteja em
`PUCOMEX_CODIGOS_RECINTO_AUTORIZADOS` — o e-mail de armazenagem é destinado
à tarifação do RioGaleão, então não faz sentido disparar para cargas
desembaraçadas em outros aeroportos/recintos que também aparecem no Portal
Único do usuário. Código do RioGaleão confirmado: `0717700` (AEROPORTO
INTERNACIONAL GALEÃO).

Formato do assunto do e-mail ajustado ao padrão exigido pelo terminal do
RioGaleão: `DUIMP {número} // {nome do importador} ({referência Nicomex}) //
SOLICITAÇÃO DE CÁLCULO` (ex: `DUIMP 25BR0000177129-0 // PERENCO
(A25-PER-014970) // SOLICITAÇÃO DE CÁLCULO`). A referência interna Nicomex
não é um campo estruturado no Portal Único — é extraída da linha
`REFERENCIA.......: A26-NXT-016599` que o despachante inclui no texto de
`informacaoComplementar` ao registrar a DUIMP.

Também implementado: para clientes cuja fatura de armazenagem deve sair
contra um CNPJ diferente do CNPJ do importador na DUIMP (ex: PERENCO), o
corpo do e-mail inclui a linha "CNPJ pagador {cnpj}" — mapeamento
configurável em `PUCOMEX_CNPJ_PAGADOR_OVERRIDES`.

Também confirmado direto na tela "Inclusão de Assinatura de Eventos" do
Portal Único (Sistema: Declaração Única de Importação → Evento:
`dimp-registro-import`, descrição "Resultado da solicitação de registro de
uma Duimp"): o formulário de inscrição tem os campos "Endereço webhook",
"Chave secreta" e "Chave de autenticação". Pelos tooltips desses dois
últimos campos, a "Chave secreta" configurada na inscrição é enviada de
volta no header `Secret` de cada chamada de notificação (é o que o
`webhookRouter.ts` valida); a "Chave de autenticação" é opcional, pensada
pra mecanismos padrão tipo HTTP Basic Authentication, enviada no header
`Authorization` — não usada por enquanto.

Ainda em aberto:

- Formato exato dos nomes de campo do payload real do webhook
  `dimp-registro-import` (`src/portalUnico/webhookTypes.ts`) — ainda não
  observado um evento real, só simulado manualmente.

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

Para testar o fluxo Portal Único → anexos sem enviar nada ainda, deixe
`DRY_RUN=true` no `.env` — o e-mail não é enviado de verdade, só logado no
console (destinatário, assunto, nome/tamanho dos anexos).

### Testando o envio de verdade sem o Graph (Gmail)

Antes de ter o app registration do Microsoft Graph pronto, dá para testar o
envio de verdade (recebendo o e-mail na sua própria caixa) usando SMTP com
uma conta pessoal do Gmail:

1. Ative a verificação em duas etapas na sua conta Google (se ainda não
   tiver).
2. Gere uma "senha de app" em
   https://myaccount.google.com/apppasswords (escolha qualquer nome, ex:
   "cct-armazenagem").
3. No `.env`:
   ```
   MAIL_PROVIDER=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=seu-email@gmail.com
   SMTP_PASS=<a senha de app gerada, sem espaços>
   MAIL_TO_TARIFACAO=seu-email@gmail.com
   DRY_RUN=false
   ```
4. Roda o teste do webhook normalmente (seção abaixo) — o e-mail deve
   chegar na sua caixa de verdade, com os dois anexos.

Se der erro `self-signed certificate in certificate chain`, é rede
corporativa (antivírus/proxy) interceptando TLS — adicione no `.env`:
```
SMTP_TLS_REJECT_UNAUTHORIZED=false
```
(só para teste local; nunca em produção).

Depois que o app registration do Graph estiver pronto, é só trocar
`MAIL_PROVIDER=graph` e preencher `GRAPH_*`/`MAIL_FROM` — nenhuma mudança de
código necessária.

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
  -H "Secret: $PUCOMEX_WEBHOOK_SECRET" \
  -d '{
    "evento": "dimp-registro-import",
    "payload": {
      "numeroDuimp": "26BR00011742683"
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
