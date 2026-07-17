import PDFDocument from "pdfkit";
import { DuimpCapa, DuimpItem, AtributoDuimp } from "./client";
import { formatarCnpj, formatarNumeroDuimp } from "./format";

const COR_TITULO = "#1F3864";
const COR_SUBTITULO = "#2E5395";
const COR_TABELA_HEADER = "#1F3864";
const COR_ZEBRA = "#F2F2F2";

function formatarDataHora(epochMs?: number | null, comSegundos = false): string {
  if (!epochMs) return "";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: comSegundos ? "2-digit" : undefined,
    hour12: false,
  })
    .formatToParts(new Date(epochMs))
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  const data = `${partes.day}/${partes.month}/${partes.year}`;
  const hora = comSegundos ? `${partes.hour}:${partes.minute}:${partes.second}` : `${partes.hour}:${partes.minute}`;
  return `${data}, ${hora}`;
}

function formatarNumero(n?: number | string | null, casas = 5): string {
  if (n == null || n === "") return "";
  const valor = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(valor)) return String(n);
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function formatarNcm(codigo?: string): string {
  const d = (codigo ?? "").replace(/\D/g, "");
  if (d.length !== 8) return codigo ?? "";
  return `${d.slice(0, 4)}.${d.slice(4)}`;
}

interface Codificado {
  codigo?: string | null;
  descricao?: string | null;
}

function codDesc(v?: Codificado | null): string {
  if (!v) return "";
  return [v.codigo, v.descricao].filter(Boolean).join(" - ");
}

interface CapaRaw {
  importadorTipo?: string;
  identificacao?: {
    cpfCnpj?: { codigo?: string; descricao?: string };
    endereco?: { logradouro?: string; municipio?: string; cep?: string; uf?: string };
  };
  informacaoComplementar?: string;
  urfDespacho?: Codificado;
  tipoIdentificacaoCarga?: string;
  cargaIdentificacao?: string;
  dadosConsolidados?: {
    situacaoDuimp?: string;
    controleCarga?: string;
    resultadoAnaliseRiscoConsolidado?: Codificado;
    conferenciaAduaneira?: { orgao?: string; resultadoAnaliseRisco?: string; situacao?: string }[];
    inspecaoMercadoria?: { orgao?: string; resultadoAnaliseRisco?: string; situacao?: string }[];
    situacaoLicenciamento?: string;
  };
  carga?: {
    tipoConhecimento?: Codificado;
    unidadeDestinoFinal?: Codificado;
    dataChegada?: number;
    unidadeEntrada?: Codificado;
    paisProcedencia?: Codificado;
    pesoLiquido?: number;
    tipoItemCarga?: Codificado;
    indicadorAOG?: boolean;
    pesoVolume?: { descricao?: string; totalVolumes?: number; totalPesoBruto?: number }[];
    indicadorPecasMadeiraNoConhecimento?: boolean;
    mercadoriaPerigosa?: Codificado[];
  };
  historicoEventos?: {
    dataEvento?: number;
    evento?: string;
    responsavel?: string;
    orgaoResponsavel?: string | null;
    infoComplementar?: string | null;
  }[];
}

/**
 * Gera um PDF do extrato da DUIMP lembrando o layout oficial (que só existe
 * no navegador — client-side, sem endpoint de servidor): Identificação,
 * Carga, Histórico e uma página por item (produto, fabricante, exportador,
 * tributos), igual ao PDF oficial.
 */
export function gerarExtratoDuimpPdf(capa: DuimpCapa, itens: DuimpItem[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const raw = capa.raw as CapaRaw;
    const numeroFormatado = formatarNumeroDuimp(capa.numeroDuimp);
    const tituloDoc = `Extrato da Duimp ${numeroFormatado} / Versão ${capa.versao}`;

    const margemEsq = doc.page.margins.left;
    const margemDir = doc.page.margins.right;
    const larguraUtil = doc.page.width - margemEsq - margemDir;

    function espacoLivre(altura: number): void {
      const limite = doc.page.height - doc.page.margins.bottom;
      if (doc.y + altura > limite) {
        doc.addPage();
      }
    }

    function tituloSecao(texto: string): void {
      espacoLivre(26);
      doc.moveDown(0.4);
      doc.fontSize(13).font("Helvetica-Bold").fillColor(COR_TITULO).text(texto, margemEsq);
      doc
        .moveTo(margemEsq, doc.y + 2)
        .lineTo(doc.page.width - margemDir, doc.y + 2)
        .strokeColor(COR_TITULO)
        .lineWidth(1)
        .stroke();
      doc.fillColor("#000000");
      doc.moveDown(0.6);
    }

    function subtituloSecao(texto: string): void {
      espacoLivre(18);
      doc.fontSize(10).font("Helvetica-Bold").fillColor(COR_SUBTITULO).text(texto, margemEsq);
      doc.fillColor("#000000");
      doc.moveDown(0.3);
    }

    function campos(pares: { label: string; valor: string }[]): void {
      const n = pares.length;
      const gap = 15;
      const largura = n > 1 ? (larguraUtil - gap * (n - 1)) / n : larguraUtil;
      const alturas = pares.map((p) => {
        doc.font("Helvetica-Bold").fontSize(8);
        const alturaLabel = doc.heightOfString(p.label, { width: largura });
        doc.font("Helvetica").fontSize(9);
        const alturaValor = doc.heightOfString(p.valor || "-", { width: largura });
        return alturaLabel + alturaValor + 4;
      });
      const alturaLinha = Math.max(...alturas);
      espacoLivre(alturaLinha);
      const y = doc.y;
      pares.forEach((p, i) => {
        const x = margemEsq + i * (largura + gap);
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#555555").text(p.label, x, y, { width: largura });
        doc.fontSize(9).font("Helvetica").fillColor("#000000").text(p.valor || "-", x, doc.y, { width: largura });
      });
      doc.y = y + alturaLinha;
      doc.moveDown(0.4);
    }

    function tabela(cabecalhos: string[], larguras: number[], linhas: string[][]): void {
      const alturaCabecalho = 16;
      espacoLivre(alturaCabecalho);
      let x = margemEsq;
      const yCab = doc.y;
      const larguraTotal = larguras.reduce((a, b) => a + b, 0);
      doc.rect(margemEsq, yCab, larguraTotal, alturaCabecalho).fill(COR_TABELA_HEADER);
      doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
      cabecalhos.forEach((h, i) => {
        doc.text(h, x + 4, yCab + 4, { width: larguras[i] - 8 });
        x += larguras[i];
      });
      doc.fillColor("#000000");
      doc.y = yCab + alturaCabecalho;

      const linhasParaDesenhar = linhas.length > 0 ? linhas : [cabecalhos.map(() => "")];
      const dadosVazios = linhas.length === 0;

      if (dadosVazios) {
        const alturaLinha = 16;
        espacoLivre(alturaLinha);
        const y = doc.y;
        doc.rect(margemEsq, y, larguraTotal, alturaLinha).fill(COR_ZEBRA);
        doc.fillColor("#000000").fontSize(8).font("Helvetica");
        doc.text("Nenhum resultado encontrado", margemEsq + 4, y + 4, { width: larguraTotal - 8, align: "center" });
        doc.y = y + alturaLinha;
      } else {
        doc.fontSize(8).font("Helvetica");
        linhasParaDesenhar.forEach((linha, idx) => {
          const alturasCelulas = linha.map((c, i) => doc.heightOfString(c || "-", { width: larguras[i] - 8 }));
          const alturaLinha = Math.max(...alturasCelulas) + 8;
          espacoLivre(alturaLinha);
          const y = doc.y;
          if (idx % 2 === 1) {
            doc.rect(margemEsq, y, larguraTotal, alturaLinha).fill(COR_ZEBRA);
            doc.fillColor("#000000");
          }
          let cx = margemEsq;
          linha.forEach((c, i) => {
            doc.text(c || "-", cx + 4, y + 4, { width: larguras[i] - 8 });
            cx += larguras[i];
          });
          doc.y = y + alturaLinha;
        });
      }
      doc.moveDown(0.6);
    }

    function rodape(): void {
      // Escrever abaixo de doc.page.margins.bottom dispararia quebra de
      // página automática do pdfkit — zera a margem temporariamente para
      // poder desenhar o rodapé na área reservada para ele.
      const margemInferiorOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - margemInferiorOriginal + 15;
      doc
        .fontSize(7)
        .fillColor("#888888")
        .text(
          `${tituloDoc} | Gerado automaticamente por cct-armazenagem em ${formatarDataHora(Date.now(), true)}`,
          margemEsq,
          y,
          { width: larguraUtil, align: "left", lineBreak: false },
        );
      doc.page.margins.bottom = margemInferiorOriginal;
      doc.fillColor("#000000");
    }

    // ---- Página 1: Identificação ----
    doc.fontSize(16).font("Helvetica-Bold").text(tituloDoc, margemEsq);
    doc.moveDown(0.6);

    campos([{ label: "SITUAÇÃO DA DUIMP", valor: raw.dadosConsolidados?.situacaoDuimp ?? "" }]);
    campos([
      { label: "CANAL ÚNICO", valor: raw.dadosConsolidados?.resultadoAnaliseRiscoConsolidado?.descricao ?? "" },
      { label: "CONTROLE DE CARGA", valor: raw.dadosConsolidados?.controleCarga ?? "" },
    ]);

    subtituloSecao("Controle Aduaneiro");
    tabela(
      ["Órgão", "Resultado da análise de risco", "Situação da conferência aduaneira"],
      [larguraUtil * 0.15, larguraUtil * 0.4, larguraUtil * 0.45],
      (raw.dadosConsolidados?.conferenciaAduaneira ?? []).map((c) => [
        c.orgao ?? "",
        c.resultadoAnaliseRisco ?? "",
        c.situacao ?? "",
      ]),
    );

    subtituloSecao("Controle Administrativo");
    tabela(
      ["Órgão", "Resultado da análise de risco", "Situação da conferência dos anuentes"],
      [larguraUtil * 0.15, larguraUtil * 0.4, larguraUtil * 0.45],
      (raw.dadosConsolidados?.inspecaoMercadoria ?? []).map((c) => [
        c.orgao ?? "",
        c.resultadoAnaliseRisco ?? "",
        c.situacao ?? "",
      ]),
    );

    campos([{ label: "SITUAÇÃO DO LICENCIAMENTO", valor: raw.dadosConsolidados?.situacaoLicenciamento ?? "" }]);

    tituloSecao("Identificação");
    subtituloSecao("Informações Básicas");
    campos([{ label: "TIPO DE IMPORTADOR", valor: raw.importadorTipo ?? "" }]);
    campos([
      { label: "CNPJ DO IMPORTADOR", valor: formatarCnpj(raw.identificacao?.cpfCnpj?.codigo) },
      { label: "NOME DO IMPORTADOR", valor: raw.identificacao?.cpfCnpj?.descricao ?? "" },
    ]);
    const endereco = raw.identificacao?.endereco;
    if (endereco) {
      campos([
        {
          label: "ENDEREÇO DO IMPORTADOR",
          valor: [endereco.logradouro, endereco.municipio, endereco.cep, endereco.uf].filter(Boolean).join(" - "),
        },
      ]);
    }

    subtituloSecao("Informações Complementares");
    espacoLivre(20);
    doc.fontSize(8).font("Courier").text(raw.informacaoComplementar ?? "", margemEsq, doc.y, {
      width: larguraUtil,
      lineGap: 1.5,
    });
    doc.moveDown(0.8);

    // ---- Carga ----
    tituloSecao("Carga");
    campos([{ label: "UNIDADE DE DESPACHO", valor: codDesc(raw.urfDespacho) }]);
    campos([{ label: "TIPO DE IDENTIFICAÇÃO DA CARGA", valor: raw.tipoIdentificacaoCarga ?? "" }]);
    campos([
      { label: "IDENTIFICAÇÃO DA CARGA", valor: raw.cargaIdentificacao ?? "" },
      { label: "TIPO DO CONHECIMENTO", valor: raw.carga?.tipoConhecimento?.descricao ?? "" },
    ]);
    campos([
      { label: "UNIDADE DE DESTINO FINAL DO CONHECIMENTO DE CARGA", valor: codDesc(raw.carga?.unidadeDestinoFinal) },
      { label: "DATA/HORA DE CHEGADA", valor: formatarDataHora(raw.carga?.dataChegada, true) },
    ]);

    subtituloSecao("Dados da Carga");
    campos([
      { label: "UNIDADE DE ENTRADA/DESCARGA", valor: codDesc(raw.carga?.unidadeEntrada) },
      { label: "PAÍS DE PROCEDÊNCIA", valor: codDesc(raw.carga?.paisProcedencia) },
    ]);
    campos([
      { label: "PESO LÍQUIDO (KG)", valor: formatarNumero(raw.carga?.pesoLiquido) },
      { label: "TIPO DE CARGA", valor: raw.carga?.tipoItemCarga?.descricao ?? "" },
    ]);
    campos([{ label: "CARGA AOG", valor: raw.carga?.indicadorAOG ? "Sim" : "Não" }]);

    subtituloSecao("Volume e Pesos");
    tabela(
      ["Descrição", "Quantidade de Volumes", "Peso Bruto (kg)"],
      [larguraUtil * 0.4, larguraUtil * 0.3, larguraUtil * 0.3],
      (raw.carga?.pesoVolume ?? []).map((v) => [
        v.descricao ?? "",
        String(v.totalVolumes ?? ""),
        formatarNumero(v.totalPesoBruto),
      ]),
    );

    subtituloSecao("Embalagem");
    campos([
      {
        label: "PRESENÇA DE PARTES E PEÇAS DE MADEIRA MACIÇA INFORMADA",
        valor: raw.carga?.indicadorPecasMadeiraNoConhecimento ? "Sim" : "Não",
      },
    ]);
    subtituloSecao("Manuseio Especial da Carga");
    tabela(
      ["Código", "Descrição"],
      [larguraUtil * 0.3, larguraUtil * 0.7],
      (raw.carga?.mercadoriaPerigosa ?? []).map((m) => [m.codigo ?? "", m.descricao ?? ""]),
    );

    // ---- Histórico ----
    tituloSecao("Histórico");
    tabela(
      ["Data/Hora", "Evento", "Responsável", "Órgão", "Informações Adicionais"],
      [larguraUtil * 0.14, larguraUtil * 0.22, larguraUtil * 0.16, larguraUtil * 0.1, larguraUtil * 0.38],
      (raw.historicoEventos ?? []).map((e) => [
        formatarDataHora(e.dataEvento),
        e.evento ?? "",
        e.responsavel ?? "",
        e.orgaoResponsavel ?? "",
        e.infoComplementar ?? "",
      ]),
    );

    // ---- Uma página por item ----
    function atributosComoCampos(atributos?: AtributoDuimp[]): void {
      (atributos ?? []).forEach((a) => {
        if (!a.nomeApresentacao) return;
        campos([{ label: a.nomeApresentacao.toUpperCase(), valor: a.valor ?? "" }]);
      });
    }

    itens.forEach((item) => {
      doc.addPage();
      doc
        .fontSize(15)
        .font("Helvetica-Bold")
        .text(`${tituloDoc} : Item ${item.numeroItem ?? ""}`, margemEsq);
      doc.moveDown(0.6);

      tituloSecao("Mercadoria");
      subtituloSecao("Caracterização da Importação");
      campos([{ label: "INDICAÇÃO DE IMPORTAÇÃO PARA TERCEIROS", valor: item.indicadorAdquirente?.descricao ?? "" }]);

      subtituloSecao("Dados do Produto");
      campos([
        {
          label: "CÓDIGO DO PRODUTO",
          valor: [item.codigoProduto, item.produto?.denominacao ?? item.produto?.descricao].filter(Boolean).join(" - "),
        },
        { label: "VERSÃO", valor: item.versaoProduto ?? "" },
      ]);
      campos([{ label: "NCM", valor: [formatarNcm(item.ncm?.codigo), item.ncm?.descricao].filter(Boolean).join(" - ") }]);

      subtituloSecao("Fabricante / Produtor");
      campos([
        { label: "PAÍS DE ORIGEM", valor: codDesc(item.fabricantePais) },
        { label: "NÚMERO DE IDENTIFICAÇÃO (CPF/CNPJ/TIN)", valor: item.fabricanteCodigo ?? "" },
      ]);
      campos([
        {
          label: "CÓDIGO DO FABRICANTE/PRODUTOR",
          valor: [item.fabricanteCodigo, item.fabricanteNome].filter(Boolean).join(" - "),
        },
        { label: "VERSÃO", valor: item.fabricanteVersao ?? "" },
      ]);
      campos([{ label: "ENDEREÇO", valor: item.fabricanteEndereco ?? "" }]);
      atributosComoCampos(item.produto?.atributos);

      subtituloSecao("Dados do Exportador Estrangeiro (Fornecedor)");
      campos([
        { label: "RELAÇÃO ENTRE EXPORTADOR E FABRICANTE/PRODUTOR", valor: item.indicadorExportadorFabricante?.descricao ?? "" },
        { label: "VINCULAÇÃO ENTRE COMPRADOR E VENDEDOR", valor: item.indicadorCompradorVendedor?.descricao ?? "" },
      ]);
      campos([
        { label: "PAÍS DE AQUISIÇÃO", valor: codDesc(item.exportadorPais) },
        { label: "NÚMERO DE IDENTIFICAÇÃO (TIN)", valor: item.exportadorTin ?? "" },
      ]);
      campos([
        {
          label: "CÓDIGO DO EXPORTADOR ESTRANGEIRO",
          valor: [item.exportadorCodigo, item.exportadorNome].filter(Boolean).join(" - "),
        },
        { label: "VERSÃO", valor: item.exportadorVersao ?? "" },
      ]);
      campos([{ label: "ENDEREÇO", valor: item.exportadorEndereco ?? "" }]);

      subtituloSecao("Dados da Mercadoria");
      campos([
        { label: "APLICAÇÃO", valor: item.tipoAplicacao?.descricao ?? "" },
        { label: "CONDIÇÃO DA MERCADORIA", valor: item.condicao?.descricao ?? "" },
      ]);
      campos([
        { label: "UNIDADE ESTATÍSTICA", valor: item.dadosMercadoriaMedidaEstatisticaUnidade ?? "" },
        { label: "QUANTIDADE NA UNIDADE ESTATÍSTICA", valor: formatarNumero(item.dadosMercadoriaMedidaEstatisticaQuantidade) },
      ]);
      campos([
        { label: "PESO LÍQUIDO (KG)", valor: formatarNumero(item.dadosMercadoriaPesoLiquido) },
        { label: "QUANTIDADE NA UNIDADE COMERCIALIZADA", valor: formatarNumero(item.quantidadeComercial) },
      ]);
      campos([
        { label: "MOEDA NEGOCIADA", valor: item.moedaNegociada?.descricao ?? "" },
        { label: "VALOR UNITÁRIO NA CONDIÇÃO DE VENDA", valor: formatarNumero(item.valorUnitarioMoedaNegociada, 7) },
      ]);
      campos([{ label: "VALOR TOTAL NA CONDIÇÃO DE VENDA", valor: formatarNumero(item.valorMercadoriaCondicaoVenda, 2) }]);

      subtituloSecao("Informações Complementares da Mercadoria");
      campos([{ label: "DETALHAMENTO DO PRODUTO", valor: item.descricaoMercadoria ?? "" }]);
      campos([{ label: "DESCRIÇÃO COMPLEMENTAR DA MERCADORIA", valor: item.produto?.descricao ?? "" }]);
      atributosComoCampos(item.atributos);

      tituloSecao("Tributos");
      subtituloSecao("Tributação");
      tabela(
        ["Tributo", "Regime de Tributação", "Fundamento"],
        [larguraUtil * 0.2, larguraUtil * 0.4, larguraUtil * 0.4],
        (item.tributos ?? []).map((t) => [
          t.tributo?.descricao ?? "",
          t.regime?.descricao ?? "",
          t.fundamento?.descricao ?? "",
        ]),
      );

      const tributosComAtributos = (item.tributos ?? []).filter((t) => (t.atributos ?? []).length > 0);
      if (tributosComAtributos.length > 0) {
        subtituloSecao("Atributos Adicionais");
        tributosComAtributos.forEach((t) => {
          const titulo = [t.tributo?.descricao, t.regime?.descricao, t.fundamento?.descricao].filter(Boolean).join(" / ");
          espacoLivre(14);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(COR_SUBTITULO).text(titulo, margemEsq);
          doc.fillColor("#000000");
          doc.moveDown(0.2);
          atributosComoCampos(t.atributos);
        });
      }
    });

    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(pageRange.start + i);
      rodape();
    }

    doc.end();
  });
}
