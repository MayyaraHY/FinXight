export type DrillEntry = { key: string; label: string };

/**
 * Maps a KPI key to the sub-lines that compose it, drawn from data already
 * available in TimelinePeriod. Keys absent from this map either have no useful
 * sub-breakdown at the period level (e.g. capitaux_propres) or are derived
 * calculated metrics (dettes, fonds_de_roulement) which already show formula
 * components via the expand toggle.
 */
export const KPI_DRILL_MAP: Record<string, DrillEntry[]> = {
  total_actif: [
    { key: "actifs_non_courants", label: "Actifs non courants" },
    { key: "actifs_courants", label: "Actifs courants" },
  ],
  actifs_courants: [
    { key: "stocks", label: "Stocks" },
    { key: "clients", label: "Clients" },
    { key: "autres_actifs_courants", label: "Autres actifs courants" },
    { key: "liquidites", label: "Liquidités" },
  ],
  total_passif: [
    { key: "capitaux_propres", label: "Capitaux propres" },
    { key: "passifs_non_courants", label: "Passifs non courants" },
    { key: "passifs_courants", label: "Passifs courants" },
  ],
  passifs_courants: [
    { key: "fournisseurs", label: "Fournisseurs" },
    { key: "concours_bancaires", label: "Concours bancaires" },
    { key: "autres_passifs_courants", label: "Autres passifs courants" },
  ],
  resultat_net: [
    { key: "produits_exploitation", label: "Produits d'exploitation" },
    { key: "charges_exploitation", label: "Charges d'exploitation" },
    { key: "resultat_exploitation", label: "Résultat d'exploitation" },
  ],
  resultat_exploitation: [
    { key: "produits_exploitation", label: "Produits d'exploitation" },
    { key: "charges_exploitation", label: "Charges d'exploitation" },
  ],
  produits_exploitation: [
    { key: "charges_exploitation", label: "Charges d'exploitation" },
    { key: "resultat_exploitation", label: "Résultat d'exploitation" },
  ],
};
