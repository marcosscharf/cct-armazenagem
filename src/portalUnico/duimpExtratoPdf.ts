import PDFDocument from "pdfkit";
import { DuimpCapa } from "./client";

function formatarCnpj(digitos?: string): string {
  const d = (digitos ?? "").replace(/\D/g, "");
  if (d.length !== 14) return digitos ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

interface CapaRaw {
  identificacao?: {
    cpfCnpj?: { codigo?: string; descricao?: string };
    endereco?: { logradouro?: string; municipio?: string; uf?: string; cep?: string };
  };
  informacaoComplementar?: string;
}

/**
 * Gera um PDF simples do extrato da DUIMP, lembrando o layout da tela
 * "Gerar Extrato" do Portal Único (que só existe no navegador — client-side,
 * sem endpoint de servidor). Usa os mesmos dados da capa da DUIMP,
 * principalmente o campo `informacaoComplementar`, que já traz o resumo
 * textual completo (fatura, conhecimento, valores, tributos, despachantes).
 */
export function gerarExtratoDuimpPdf(capa: DuimpCapa): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const raw = capa.raw as CapaRaw;
    const cpfCnpj = raw.identificacao?.cpfCnpj;
    const endereco = raw.identificacao?.endereco;

    doc.fontSize(14).font("Helvetica-Bold").text(`Extrato da DUIMP ${capa.numeroDuimp} / Versão ${capa.versao}`);
    doc.moveDown(1);

    doc.fontSize(10).font("Helvetica-Bold").text("CNPJ do importador:", { continued: true });
    doc.font("Helvetica").text(` ${formatarCnpj(cpfCnpj?.codigo)}`);
    doc.font("Helvetica-Bold").text("Nome do importador:", { continued: true });
    doc.font("Helvetica").text(` ${cpfCnpj?.descricao ?? ""}`);

    if (endereco) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Endereço do importador:");
      doc.font("Helvetica").text(
        `${endereco.logradouro ?? ""} - ${endereco.municipio ?? ""}/${endereco.uf ?? ""} - CEP ${endereco.cep ?? ""}`,
      );
    }

    doc.moveDown(1);
    doc.fontSize(11).font("Helvetica-Bold").text("Informações Complementares");
    doc.moveDown(0.3);
    doc.fontSize(8).font("Courier").text(raw.informacaoComplementar ?? "", { lineGap: 1.5 });

    doc.end();
  });
}
