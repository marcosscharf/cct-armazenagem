import express from "express";
import { config } from "./config";
import { webhookRouter } from "./portalUnico/webhookRouter";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(webhookRouter);

app.listen(config.port, () => {
  console.log(`cct-armazenagem ouvindo na porta ${config.port}`);
});
