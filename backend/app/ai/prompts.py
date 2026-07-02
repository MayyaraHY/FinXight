"""
AI prompts for bilan and CR diagnosis.
"""

_CONVENTIONS = """
CONVENTION DE SIGNE (CRITIQUE — lire avant tout):
- Les soldes sont stockés en convention DÉBIT POSITIF / CRÉDIT NÉGATIF.
- Classe 7 (produits, revenus) = nature créditrice = solde NÉGATIF. C'est NORMAL. Ne jamais signaler un compte 7xx comme anomalie.
- Classe 6 (charges) = nature débitrice = solde POSITIF. Normal.
- Compte 131 (résultat bénéficiaire) = crédit = solde NÉGATIF dans les données. C'est un bénéfice.
- Compte 135 (résultat déficitaire) = débit = solde POSITIF dans les données. C'est une perte.
- Ne JAMAIS signaler un solde dont le signe correspond à la nature comptable du compte.
"""

# ---------------------------------------------------------------------------
# Bilan imbalance diagnosis
# ---------------------------------------------------------------------------
BILAN_IMBALANCE_PROMPT = _CONVENTIONS + """
Le bilan est DÉSÉQUILIBRÉ. Actif ≠ Passif. Différence = {difference} DT.

Voici les anomalies DÉJÀ DÉTECTÉES et CALCULÉES par le moteur de contrôle Python (JSON):
{detected_issues}

Ta tâche : traduire ces anomalies en français clair et actionnable pour un comptable tunisien.

INTERDICTIONS ABSOLUES:
- N'effectue AUCUN calcul. Les montants sont déjà calculés et fournis ci-dessus.
- N'invente AUCUN solde, AUCUN montant, AUCUN compte qui ne figure pas dans detected_issues.
- Ne signale rien qui ne soit pas dans detected_issues.
- N'explique pas la convention de signe à l'utilisateur.

Si detected_issues est vide : réponds uniquement "Aucune anomalie détectée automatiquement. Vérification manuelle recommandée."

Format de réponse (max 5 puces par section, pas d'introduction, pas de conclusion):
**Problèmes détectés:**
- [compte PCGT + montant exact tiré du JSON]

**Comment corriger:**
- [action corrective concrète avec numéro de compte]
"""

# ---------------------------------------------------------------------------
# CR diagnosis
# ---------------------------------------------------------------------------
CR_DIAGNOSIS_PROMPT = _CONVENTIONS + """
Le Compte de Résultat contient des avertissements de calcul.

Voici les avertissements DÉJÀ DÉTECTÉS par le moteur de contrôle Python:
{warnings}

Ta tâche : traduire ces avertissements en français clair pour un comptable tunisien.

INTERDICTIONS ABSOLUES:
- N'effectue AUCUN calcul supplémentaire.
- N'invente aucun problème qui ne figure pas dans la liste ci-dessus.
- Ne signale pas les soldes négatifs des comptes 7xx — c'est normal.

Si la liste est vide : réponds "Aucun avertissement de calcul détecté."

Format (max 5 puces par section, pas d'introduction):
**Problèmes détectés:**
- [numéro de ligne CR + description]

**Comment corriger:**
- [action corrective concrète]
"""
