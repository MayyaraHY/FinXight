import re
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.custom_metric import CustomMetric
from app.repositories.custom_metric_repository import CustomMetricRepository
from app.services.company_service import CompanyService

# Named statement variables a formula may reference (must match the enriched
# timeline payload / the frontend variable registry).
ALLOWED_VARS = {
    "total_actif", "actifs_non_courants", "actifs_courants",
    "total_passif", "capitaux_propres", "passifs_non_courants", "passifs_courants",
    "resultat_net", "produits_exploitation", "charges_exploitation", "resultat_exploitation",
    "stocks", "clients", "fournisseurs", "autres_actifs_courants", "autres_passifs_courants",
    "liquidites", "concours_bancaires",
    "dettes", "fonds_de_roulement",
}
_VALID_KINDS = {"kpi", "ratio"}
_VALID_FORMATS = {"currency", "ratio", "percent"}
_TOKEN_RE = re.compile(r"\s*([A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[()+\-*/])")


def _validate_formula(formula: str) -> None:
    """Lightweight server-side sanity check; the authoritative evaluation is on
    the frontend. Rejects unknown identifiers, stray characters, unbalanced parens."""
    if not formula or not formula.strip():
        raise ValueError("La formule est vide.")
    pos, depth = 0, 0
    s = formula
    while pos < len(s):
        m = _TOKEN_RE.match(s, pos)
        if not m:
            raise ValueError(f"Caractère invalide dans la formule à la position {pos}.")
        tok = m.group(1)
        if tok == "(":
            depth += 1
        elif tok == ")":
            depth -= 1
            if depth < 0:
                raise ValueError("Parenthèses déséquilibrées.")
        elif tok[0].isalpha() or tok[0] == "_":
            if tok not in ALLOWED_VARS:
                raise ValueError(f"Variable inconnue : {tok}")
        pos = m.end()
    if depth != 0:
        raise ValueError("Parenthèses déséquilibrées.")


def _serialize(m: CustomMetric) -> dict:
    return {
        "id": m.id,
        "company_id": m.company_id,
        "name": m.name,
        "formula": m.formula,
        "kind": m.kind,
        "format": m.format,
        "higher_better": m.higher_better,
        "threshold": float(m.threshold) if m.threshold is not None else None,
        "created_at": m.created_at,
    }


class CustomMetricService:

    def __init__(self, db: Session):
        self.repo = CustomMetricRepository(db)
        self.company_service = CompanyService(db)

    def list_metrics(self, company_id: int, user_id: UUID) -> list[dict]:
        self.company_service.get_company(company_id, user_id)
        return [_serialize(m) for m in self.repo.get_by_company(company_id, user_id)]

    def create_metric(self, company_id: int, user_id: UUID, body: dict) -> dict:
        self.company_service.get_company(company_id, user_id)
        self._check(body, partial=False)
        metric = self.repo.create(
            company_id=company_id,
            user_id=user_id,
            name=body["name"],
            formula=body["formula"],
            kind=body["kind"],
            format=body.get("format"),
            higher_better=body.get("higher_better", True),
            threshold=body.get("threshold"),
        )
        return _serialize(metric)

    def update_metric(self, metric_id: int, company_id: int, user_id: UUID, body: dict) -> dict:
        self.company_service.get_company(company_id, user_id)
        metric = self.repo.get_by_id(metric_id, company_id, user_id)
        if not metric:
            raise ValueError(f"Custom metric {metric_id} not found")
        self._check(body, partial=True)
        return _serialize(self.repo.update(metric, {k: v for k, v in body.items() if v is not None}))

    def delete_metric(self, metric_id: int, company_id: int, user_id: UUID) -> None:
        self.company_service.get_company(company_id, user_id)
        metric = self.repo.get_by_id(metric_id, company_id, user_id)
        if not metric:
            raise ValueError(f"Custom metric {metric_id} not found")
        self.repo.delete(metric)

    @staticmethod
    def _check(body: dict, partial: bool) -> None:
        if (not partial or "formula" in body) and body.get("formula") is not None:
            _validate_formula(body["formula"])
        if (not partial or "kind" in body) and body.get("kind") is not None:
            if body["kind"] not in _VALID_KINDS:
                raise ValueError(f"kind invalide : {body['kind']}")
        if body.get("format") is not None and body["format"] not in _VALID_FORMATS:
            raise ValueError(f"format invalide : {body['format']}")
        if not partial and not (body.get("name") or "").strip():
            raise ValueError("Le nom est requis.")
