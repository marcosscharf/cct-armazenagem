import { Router } from "express";
import { config } from "../config";
import { extrairNumeroDuimpDoEvento } from "./webhookTypes";
import { descreverErro } from "./erros";
import { handleDuimpRegistro } from "../workflow/solicitarCalculoArmazenagem";

export const webhookRouter = Router();

/**
 * Endpoint que o Portal Único chama quando um evento inscrito acontece.
 *
 * Autenticação: header `Secret` (confirmado na doc oficial de Notificação
 * de eventos push — é a "Chave secreta" preenchida na inscrição).
 *
 * Identificação do evento: header `event-type` — o campo `evento` no
 * corpo é só uma descrição textual do que aconteceu, não o identificador
 * técnico da subscrição.
 *
 * Timeout: a doc oficial define um limite de 3500ms para o processamento
 * da requisição, considerando erro acima disso. Nosso processamento real
 * (buscar capa/itens da DUIMP, buscar carga no CCT, gerar dois PDFs,
 * enviar e-mail) é bem mais lento que isso — por isso a resposta é
 * enviada imediatamente após validar a chamada, e o processamento roda em
 * segundo plano (fire-and-forget), com erros só logados no servidor.
 */
webhookRouter.post("/webhooks/portal-unico", (req, res) => {
  const receivedSecret = req.header("Secret");
  if (!config.pucomex.webhookSecret || receivedSecret !== config.pucomex.webhookSecret) {
    res.status(401).json({ error: "assinatura inválida" });
    return;
  }

  const eventType = req.header("event-type");
  const body = req.body;

  res.status(200).json({ status: "recebido" });

  // Loga o payload cru de todo evento recebido: os nomes de campo reais de
  // `ccti-vinc-docto-saida` ainda não foram observados, e é assim que
  // conseguimos ajustar a extração com precisão quando o primeiro evento
  // real chegar.
  console.log(`Evento recebido (event-type: ${eventType ?? "ausente"}): ${JSON.stringify(body)}`);

  if (
    config.pucomex.watchedEventIds.length > 0 &&
    (!eventType || !config.pucomex.watchedEventIds.includes(eventType))
  ) {
    console.log(`Evento ignorado: "${eventType ?? "(ausente)"}" fora da lista monitorada.`);
    return;
  }

  const numeroDuimp = extrairNumeroDuimpDoEvento(eventType, body);
  if (!numeroDuimp) {
    console.log(
      "Evento ignorado: nenhum número de DUIMP encontrado no payload " +
        "(esperado para vinculações de DI, que estão fora do escopo).",
    );
    return;
  }

  handleDuimpRegistro(numeroDuimp).catch((err) => {
    console.error(`Falha ao processar DUIMP ${numeroDuimp}: ${descreverErro(err)}`);
  });
});
