export const PAY_PLANS = [
  {
    id: "dia",
    name: "24 horas",
    blurb: "Un día entero de estudio.",
    euros: 2.99,
    hours: 24,
    featured: false,
  },
  {
    id: "semana",
    name: "7 días",
    blurb: "Una semana de generación.",
    euros: 7.99,
    hours: 24 * 7,
    featured: true,
  },
  {
    id: "mes",
    name: "30 días",
    blurb: "Un mes de Lumen sin cortes.",
    euros: 14.99,
    hours: 24 * 30,
    featured: false,
  },
] as const;

export type PayPlanId = (typeof PAY_PLANS)[number]["id"];

export function getPlan(id: string) {
  return PAY_PLANS.find((plan) => plan.id === id) ?? null;
}

export function formatPlanEur(euros: number) {
  return euros.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
