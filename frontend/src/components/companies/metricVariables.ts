import { TimelinePeriod } from "@/models/Company";

/** Variables a custom formula may reference, with display labels. */
export const METRIC_VARIABLES: { key: string; label: string }[] = [
  { key: "total_actif", label: "Total Actif" },
  { key: "actifs_non_courants", label: "Actifs non courants" },
  { key: "actifs_courants", label: "Actifs courants" },
  { key: "total_passif", label: "Total Passif" },
  { key: "capitaux_propres", label: "Capitaux propres" },
  { key: "passifs_non_courants", label: "Passifs non courants" },
  { key: "passifs_courants", label: "Passifs courants" },
  { key: "resultat_net", label: "Résultat net" },
  { key: "produits_exploitation", label: "Produits d'exploitation" },
  { key: "charges_exploitation", label: "Charges d'exploitation" },
  { key: "resultat_exploitation", label: "Résultat d'exploitation" },
  { key: "stocks", label: "Stocks" },
  { key: "clients", label: "Clients" },
  { key: "fournisseurs", label: "Fournisseurs" },
  { key: "autres_actifs_courants", label: "Autres actifs courants" },
  { key: "autres_passifs_courants", label: "Autres passifs courants" },
  { key: "liquidites", label: "Liquidités" },
  { key: "concours_bancaires", label: "Concours bancaires" },
  { key: "dettes", label: "Dettes (PNC + PC)" },
  { key: "fonds_de_roulement", label: "Fonds de roulement" },
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
