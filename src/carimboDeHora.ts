/**
 * Prefixa cada linha de log com data e hora de Brasília.
 *
 * Sem isso o `out.log` e o `err.log` não diziam quando cada coisa aconteceu,
 * e investigar um relato como "o e-mail de hoje não chegou" exigia adivinhar
 * quais linhas eram de hoje.
 *
 * O formato "sv-SE" do Intl produz `AAAA-MM-DD HH:MM:SS`, que ordena bem e
 * é fácil de filtrar (`Select-String "2026-11-05"`).
 */
const formato = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

for (const metodo of ["log", "warn", "error"] as const) {
  const original = console[metodo].bind(console);
  console[metodo] = (...args: unknown[]) => original(`[${formato.format(new Date())}]`, ...args);
}
