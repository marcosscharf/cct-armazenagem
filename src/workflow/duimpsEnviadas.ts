import fs from "node:fs";
import path from "node:path";

/**
 * Registro das DUIMPs que já tiveram solicitação enviada, para não mandar o
 * mesmo pedido duas vezes ao terminal.
 *
 * Por que existe: o Portal Único dispara um evento de vinculação de carga a
 * cada tentativa de registro da DUIMP. Quando o registro falha e é repetido,
 * a carga é vinculada e desvinculada várias vezes em poucos minutos —
 * observado em produção numa DUIMP com vinculações às 12:43, 12:45, 12:46 e
 * 12:53 (registro efetivo), que resultaram em três e-mails idênticos para o
 * RioGaleão.
 *
 * O registro é gravado em arquivo para sobreviver a reinício do serviço (um
 * deploy no meio da janela de duplicatas, por exemplo).
 */

const ARQUIVO = path.resolve(process.env.ARQUIVO_DUIMPS_ENVIADAS ?? "dados/duimps-enviadas.txt");

/**
 * Por quanto tempo uma DUIMP já enviada bloqueia um novo envio.
 *
 * Não é "para sempre" de propósito: uma retificação posterior pode religar a
 * carga e aí um novo pedido faz sentido. A janela cobre com folga a rajada
 * de vinculações do registro (minutos) sem impedir um reenvio legítimo mais
 * tarde. Entre os dois erros possíveis, deixar de enviar é pior que enviar
 * duas vezes.
 */
const JANELA_HORAS = Number(process.env.DUIMPS_ENVIADAS_JANELA_HORAS ?? 6);

/** numeroDuimp -> instante do envio. Carregado do arquivo na primeira consulta. */
let cache: Map<string, number> | null = null;

function carregar(): Map<string, number> {
  if (cache) {
    return cache;
  }

  cache = new Map();
  try {
    const conteudo = fs.readFileSync(ARQUIVO, "utf8");
    for (const linha of conteudo.split("\n")) {
      const [numero, iso] = linha.split("\t");
      const instante = Date.parse(iso ?? "");
      if (numero && !Number.isNaN(instante)) {
        cache.set(numero, instante);
      }
    }
  } catch {
    // Arquivo ainda não existe (primeira execução) ou está ilegível: começa
    // vazio. Perder o histórico só pode causar um e-mail repetido, nunca um
    // e-mail a menos — por isso não vale derrubar o processamento aqui.
  }
  return cache;
}

/** Instante do envio anterior dentro da janela, ou null se pode enviar. */
export function envioRecente(numeroDuimp: string): Date | null {
  const instante = carregar().get(numeroDuimp);
  if (instante === undefined) {
    return null;
  }
  const expirouEm = instante + JANELA_HORAS * 60 * 60 * 1000;
  return Date.now() < expirouEm ? new Date(instante) : null;
}

export function registrarEnvio(numeroDuimp: string): void {
  const agora = new Date();
  carregar().set(numeroDuimp, agora.getTime());

  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.appendFileSync(ARQUIVO, `${numeroDuimp}\t${agora.toISOString()}\n`, "utf8");
  } catch (err) {
    // O e-mail já saiu; falhar aqui só perde a proteção contra repetição
    // após um reinício. Registra e segue.
    console.error(`Não foi possível gravar o registro de envio da DUIMP ${numeroDuimp}:`, err);
  }
}
