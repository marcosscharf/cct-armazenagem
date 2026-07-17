export function formatarCnpj(digitos?: string): string {
  const d = (digitos ?? "").replace(/\D/g, "");
  if (d.length !== 14) return digitos ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatarNumeroDuimp(numeroDuimp: string): string {
  const prefixo = numeroDuimp.slice(0, 4);
  const resto = numeroDuimp.slice(4);
  if (resto.length < 2) return numeroDuimp;
  return `${prefixo}${resto.slice(0, -1)}-${resto.slice(-1)}`;
}
