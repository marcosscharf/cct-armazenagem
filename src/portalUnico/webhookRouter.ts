import { Router } from "express";
import { config } from "../config";
import { isDuimpRegistroEvent } from "./webhookTypes";
import { handleDuimpRegistro } from "../workflow/solicitarCalculoArmazenagem";

export const webhookRouter = Router();

/**
 * Endpoint que o Portal Único chama quando um evento inscrito acontece.
 * TODO: confirmar mecanismo real de autenticação da chamada recebida
 * (chaveSecreta/chaveAutenticacao definidas na inscrição) e trocar essa
 * checagem simplificada por header pela forma correta assim que confirmado.
 */
webhookRouter.post("/webhooks/portal-unico", async (req, res) => {
  const receivedSecret = req.header("x-pucomex-secret");
  if (!config.pucomex.webhookSecret || receivedSecret !== config.pucomex.webhookSecret) {
    res.status(401).json({ error: "assinatura inválida" });
    return;
  }

  const body = req.body;

  if (!isDuimpRegistroEvent(body)) {
    // Evento não reconhecido: responde 200 para não gerar retentativas do
    // Portal Único, mas não processa.
    res.status(200).json({ status: "ignorado", motivo: "formato não reconhecido" });
    return;
  }

  if (
    config.pucomex.watchedEventIds.length > 0 &&
    !config.pucomex.watchedEventIds.includes(body.evento)
  ) {
    res.status(200).json({ status: "ignorado", motivo: "evento fora da lista monitorada" });
    return;
  }

  try {
    await handleDuimpRegistro(body);
    res.status(200).json({ status: "processado" });
  } catch (err) {
    console.error("Falha ao processar evento de registro de DUIMP", err);
    // 500 faz o Portal Único reenviar (até 3 tentativas, uma a cada 5min).
    res.status(500).json({ status: "erro" });
  }
});
