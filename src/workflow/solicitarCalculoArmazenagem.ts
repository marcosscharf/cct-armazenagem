import { getDuimpExtrato, getCctCarga } from "../portalUnico/client";
import { sendCalculoArmazenagemEmail } from "../mail/graphMailer";
import { VinculacaoCargaEvent } from "../portalUnico/webhookTypes";

export async function handleVinculacaoCarga(event: VinculacaoCargaEvent): Promise<void> {
  const numeroDuimp = event.payload.numeroDuimp;
  const numeroAwb = event.payload.numeroDocumentoCarga;

  if (!numeroDuimp || !numeroAwb) {
    throw new Error(
      `Evento sem numeroDuimp/numeroDocumentoCarga: ${JSON.stringify(event.payload)}`,
    );
  }

  const [duimpExtrato, cctCarga] = await Promise.all([
    getDuimpExtrato(numeroDuimp),
    getCctCarga(numeroAwb),
  ]);

  await sendCalculoArmazenagemEmail({
    numeroDuimp,
    numeroAwb,
    attachments: [
      {
        filename: `duimp-${numeroDuimp}-extrato.json`,
        contentType: "application/json",
        contentBytes: Buffer.from(JSON.stringify(duimpExtrato.raw, null, 2)).toString("base64"),
      },
      {
        filename: `cct-${numeroAwb}-carga.json`,
        contentType: "application/json",
        contentBytes: Buffer.from(JSON.stringify(cctCarga.raw, null, 2)).toString("base64"),
      },
    ],
  });
}
