export function calcularOferta(values) {
  const fields = [
    ['reventa', 1, 1e12],
    ['alistamiento', 0, 1e12],
    ['otrosCostos', 0, 1e12],
    ['margenPorcentaje', 0, 100],
  ];
  if (!fields.every(([key, min, max]) => {
    const value = String(values?.[key] ?? '');
    const number = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= min && number <= max;
  })) return null;

  const { reventa, alistamiento, otrosCostos, margenPorcentaje } = Object.fromEntries(
    fields.map(([key]) => [key, Number(values[key])])
  );
  const margen = Math.round(reventa * margenPorcentaje / 100);
  const saldo = reventa - alistamiento - otrosCostos - margen;
  return { reventa, alistamiento, otrosCostos, margenPorcentaje, margen, saldo, maximo: Math.max(0, saldo) };
}
