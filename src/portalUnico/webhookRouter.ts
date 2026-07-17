import { Router } from "express";
import { config } from "../config";
import { isDuimpRegistroEvent } from "./webhookTypes";
import { handleDuimpRegistro } from "../workflow/solicitarCalculoArmazenagem";

export const webhookRouter = Router();

/**
 * Endpoint que o Portal Único chama quando um evento inscrito acontece.
 *
 * Autenticação: header `Secret` (confirmado na doc oficial de Notificação
 * de eventos push — é a "Chave secreta" preenchida na inscrição).
 *
 * Identificação do evento: header `event-type` — o campo `evento` no
 * corpo é só uma descrição textual do que aconteceu (ex: ["Solicitação de
 * Registro"]), não o identificador técnico da subscrição (ex:
 * "dimp-registro-import").
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

  if (
    config.pucomex.watchedEventIds.length > 0 &&
    (!eventType || !config.pucomex.watchedEventIds.includes(eventType))
  ) {
    console.log(`Evento ignorado: event-type "${eventType ?? "(ausente)"}" fora da lista monitorada.`);
    return;
  }

  if (!isDuimpRegistroEvent(body)) {
    console.warn("Evento com formato não reconhecido, ignorado:", JSON.stringify(body));
    return;
  }

  handleDuimpRegistro(body).catch((err) => {
    console.error("Falha ao processar evento de registro de DUIMP", err);
  });
});
