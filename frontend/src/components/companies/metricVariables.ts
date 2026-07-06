import { TimelinePeriod } from "@/models/Company";

/** Display format for a metric variable / operand value. */
export type MetricFormat = "currency" | "ratio" | "percent";

/** Variables a custom formula may reference, with display labels and their own
 *  natural display format. Every statement variable is a monetary amount, so
 *  operands must be shown as currency even when the parent metric is a percent
 *  (otherwise a money operand would be rendered as e.g. "50000000.0%"). */
export const METRIC_VARIABLES: { key: string; label: string; format: MetricFormat }[] = [
  { key: "total_actif", label: "Total Actif", format: "currency" },
  { key: "actifs_non_courants", label: "Actifs non courants", format: "currency" },
  { key: "actifs_courants", label: "Actifs courants", format: "currency" },
  { key: "total_passif", label: "Total Passif", format: "currency" },
  { key: "capitaux_propres", label: "Capitaux propres", format: "currency" },
  { key: "passifs_non_courants", label: "Passifs non courants", format: "currency" },
  { key: "passifs_courants", label: "Passifs courants", format: "currency" },
  { key: "resultat_net", label: "Résultat net", format: "currency" },
  { key: "produits_exploitation", label: "Produits d'exploitation", format: "currency" },
  { key: "charges_exploitation", label: "Charges d'exploitation", format: "currency" },
  { key: "resultat_exploitation", label: "Résultat d'exploitation", format: "currency" },
  { key: "stocks", label: "Stocks", format: "currency" },
  { key: "clients", label: "Clients", format: "currency" },
  { key: "fournisseurs", label: "Fournisseurs", format: "currency" },
  { key: "autres_actifs_courants", label: "Autres actifs courants", format: "currency" },
  { key: "autres_passifs_courants", label: "Autres passifs courants", format: "currency" },
  { key: "liquidites", label: "Liquidités", format: "currency" },
  { key: "concours_bancaires", label: "Concours bancaires", format: "currency" },
  { key: "dettes", label: "Dettes (PNC + PC)", format: "currency" },
  { key: "fonds_de_roulement", label: "Fonds de roulement", format: "currency" },
];

export const METRIC_VARIABLE_KEYS = METRIC_VARIABLES.map((v) => v.key);

/** Build the variable map for one period, including the derived convenience vars. */
export function periodVars(p: TimelinePeriod | null): Record<string, number | null> {
  if (!p) return {};
  const get = (v: number | null | undefined) => (v == null ? null : v);
  const pnc = p.passifs_non_courants;
  const pc = p.passifs_courants;
  const dettes = pnc == null && pc == null ? null : (pnc ?? 0) + (pc ?? 0);
  const fr =
    p.capitaux_propres == null && pnc == null && p.actifs_non_courants == null
      ? null
      : (p.capitaux_propres ?? 0) + (pnc ?? 0) - (p.actifs_non_courants ?? 0);

  return {
    total_actif: get(p.total_actif),
    actifs_non_courants: get(p.actifs_non_courants),
    actifs_courants: get(p.actifs_courants),
    total_passif: get(p.total_passif),
    capitaux_propres: get(p.capitaux_propres),
    passifs_non_courants: get(pnc),
    passifs_courants: get(pc),
    resultat_net: get(p.resultat_net),
    produits_exploitation: get(p.produits_exploitation),
    charges_exploitation: get(p.charges_exploitation),
    resultat_exploitation: get(p.resultat_exploitation),
    stocks: get(p.stocks),
    clients: get(p.clients),
    fournisseurs: get(p.fournisseurs),
    autres_actifs_courants: get(p.autres_actifs_courants),
    autres_passifs_courants: get(p.autres_passifs_courants),
    liquidites: get(p.liquidites),
    concours_bancaires: get(p.concours_bancaires),
    dettes,
    fonds_de_roulement: fr,
  };
}
