import type { CompanyStatus } from "@/models/Company";

/** Per-card status: undefined = still loading, null = failed to load. */
export type StatusState = CompanyStatus | null | undefined;

export type Severity = "ok" | "warning" | "error" | "empty";

export function severityOf(s: CompanyStatus): Severity {
  if (!s.has_data) return "empty";
  if (s.validation_errors > 0 || !s.balanced) return "error";
  if (s.validation_warnings > 0 || s.open_anomalies > 0) return "warning";
  return "ok";
}

/** Count of unresolved issues surfaced on a card / used by the attention list. */
export function issueCount(s: CompanyStatus): number {
  if (!s.has_data) return 0;
  return s.validation_errors + s.open_anomalies + (s.balanced ? 0 : 1);
}

/** A single actionable issue: a French label and where to go to resolve it. */
export type IssueLink = { label: string; href: string };

/**
 * Concrete, clickable issues for a company, each deep-linking to the exact
 * page where it can be resolved (the relevant tab of the latest upload).
 * Empty when there's nothing to fix or no upload to point at.
 */
export function issueLinks(s: CompanyStatus): IssueLink[] {
  if (!s.has_data || s.upload_id == null) return [];
  const base = `/uploads/${s.upload_id}`;
  const links: IssueLink[] = [];

  if (s.validation_errors > 0) {
    links.push({
      label: `${s.validation_errors} erreur${s.validation_errors !== 1 ? "s" : ""} de validation`,
      href: `${base}/validation`,
    });
  }
  if (!s.balanced) {
    links.push({ label: "Bilan déséquilibré", href: `${base}/bilan` });
  }
  if (s.open_anomalies > 0) {
    links.push({
      label: `${s.open_anomalies} anomalie${s.open_anomalies !== 1 ? "s" : ""}`,
      href: `${base}/anomalies`,
    });
  }
  return links;
}

/** French labels for known audit event types. */
const ACTIVITY_LABELS_FR: Record<string, string> = {
  LOGIN: "Connexion",
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILED: "Échec de connexion",
  LOGOUT: "Déconnexion",
  REGISTER: "Inscription",
  REGISTRATION: "Inscription",
  PASSWORD_RESET: "Réinitialisation du mot de passe",
  PASSWORD_CHANGED: "Mot de passe modifié",
  EMAIL_VERIFIED: "E-mail vérifié",
  PROFILE_UPDATED: "Profil mis à jour",
  UPLOAD_FILE: "Fichier téléversé",
  TOKEN_REFRESH: "Session renouvelée",
};

/** Turns an audit event type (e.g. "LOGIN_SUCCESS") into a readable French label. */
export function formatActivity(ev: string | null): string {
  if (!ev) return "Activité";
  const key = ev.toUpperCase();
  if (ACTIVITY_LABELS_FR[key]) return ACTIVITY_LABELS_FR[key];
  // Fallback: prettify the raw event type.
  return ev
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
