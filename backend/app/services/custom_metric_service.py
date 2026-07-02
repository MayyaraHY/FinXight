from uuid import UUID
from sqlalchemy.orm import Session

from app.ai import formula_generator
from app.core import formula as formula_grammar
from app.core.metric_variables import VARIABLE_KEYS
from app.models.custom_metric import CustomMetric
from app.repositories.custom_metric_repository import CustomMetricRepository
from app.services.company_service import CompanyService

# Named statement variables a formula may reference. Single source of truth is
# app.core.metric_variables.VARIABLE_KEYS (same set the metric engine builds and
# the timeline payload carries), so validation and evaluation can never disagree.
ALLOWED_VARS = VARIABLE_KEYS
_VALID_KINDS = {"kpi", "ratio"}
_VALID_FORMATS = {"currency", "ratio", "percent"}


class MetricNotComputable(ValueError):
    """The requested metric cannot be built from the allowed variables. A refusal,
    NOT a transient error — the generator must not retry or fabricate a formula.
    Subclasses ValueError so the controller's `except ValueError` returns 400."""


def _validate_formula(formula: str) -> None:
    """Full server-side validation via the shared grammar (app.core.formula):
    rejects unknown identifiers, stray characters, unbalanced parens, AND wrong
    arity / dangling operators — so the server rejects exactly what the frontend
    engine can't evaluate. Raises ValueError (FormulaError) on any problem."""
    formula_grammar.validate(formula, ALLOWED_VARS)


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

    def generate_metric(
        self, company_id: int, user_id: UUID, name: str, variables: list[dict]
    ) -> dict:
        """Company-scoped AI generation (validates company ownership first)."""
        self.company_service.get_company(company_id, user_id)
        return self._generate_core(name, variables)

    # --- Global library (user-scoped; company_id IS NULL) -------------------
    # These mirror the company-scoped methods above but drop the company check;
    # they reuse the identical validation / normalization / refusal guards.
    def list_library(self, user_id: UUID) -> list[dict]:
        return [_serialize(m) for m in self.repo.get_by_user(user_id)]

    def create_library(self, user_id: UUID, body: dict) -> dict:
        self._check(body, partial=False)
        metric = self.repo.create(
            company_id=None,
            user_id=user_id,
            name=body["name"],
            formula=body["formula"],
            kind=body["kind"],
            format=body.get("format"),
            higher_better=body.get("higher_better", True),
            threshold=body.get("threshold"),
        )
        return _serialize(metric)

    def update_library(self, metric_id: int, user_id: UUID, body: dict) -> dict:
        metric = self.repo.get_by_id_for_user(metric_id, user_id)
        if not metric:
            raise ValueError(f"Custom metric {metric_id} not found")
        self._check(body, partial=True)
        return _serialize(self.repo.update(metric, {k: v for k, v in body.items() if v is not None}))

    def delete_library(self, metric_id: int, user_id: UUID) -> None:
        metric = self.repo.get_by_id_for_user(metric_id, user_id)
        if not metric:
            raise ValueError(f"Custom metric {metric_id} not found")
        self.repo.delete(metric)

    def generate_library(self, user_id: UUID, name: str, variables: list[dict]) -> dict:
        """User-scoped AI generation — no company binding."""
        return self._generate_core(name, variables)

    def _generate_core(self, name: str, variables: list[dict]) -> dict:
        """Ask Groq for a metric definition from `name`, then validate/normalize it
        with the same guards as a hand-typed metric. Retries once if the generated
        formula fails validation, feeding the error back to the model."""
        if not (name or "").strip():
            raise ValueError("Le nom est requis pour la génération.")

        raw = formula_generator.generate_metric_json(name, variables)
        try:
            return self._normalize_generated(raw, name)
        except MetricNotComputable:
            raise  # refusal — do NOT retry or fabricate
        except ValueError as first_err:
            # One corrective retry — tell the model exactly what was wrong.
            raw = formula_generator.generate_metric_json(
                name, variables, extra_instruction=str(first_err)
            )
            try:
                return self._normalize_generated(raw, name)
            except MetricNotComputable:
                raise
            except ValueError:
                raise ValueError(
                    "La formule générée est invalide, réessayez ou saisissez-la manuellement."
                )

    @staticmethod
    def _normalize_generated(raw: dict, requested_name: str = "") -> dict:
        """Coerce and validate the model's JSON into a clean metric dict.

        When the model maps the request to a known metric (catalog_key) AND that
        key actually matches the requested name, the canonical built-in
        definition overrides the generated formula/kind/format/higher_better/
        threshold — guaranteeing correctness for common metrics. A mis-mapped
        catalog_key is ignored (falls through to validated free-generation).
        When the model reports the metric is not computable, refuse instead of
        saving a fabricated formula.
        """
        catalog_key = raw.get("catalog_key")
        # Only trust the override when the key plausibly matches the request. The
        # empty-name case (e.g. offline eval) keeps the legacy trust-the-model path.
        key_ok = bool(catalog_key) and (
            not requested_name
            or formula_generator.catalog_key_matches(requested_name, catalog_key)
        )
        catalog = formula_generator.CATALOG_METRICS.get(catalog_key) if key_ok else None
        if not catalog and raw.get("computable") is False:
            raise MetricNotComputable(
                "Cet indicateur ne peut pas être calculé à partir des données disponibles."
            )
        if catalog:
            formula = catalog["formula"]
            kind = catalog["kind"]
            fmt = catalog["format"]
            higher_better = catalog["higher_better"]
            threshold = catalog["threshold"]
            name = (raw.get("name") or "").strip() or catalog["name"]
        else:
            formula = (raw.get("formula") or "").strip()
            kind = raw.get("kind") if raw.get("kind") in _VALID_KINDS else "kpi"
            fmt = raw.get("format")
            if fmt not in _VALID_FORMATS:
                fmt = "currency" if kind == "kpi" else "ratio"
            # Coherence: a "kpi" is a montant (currency); a "ratio" is never a
            # currency amount. Fix contradictory kind/format pairs from the model.
            if kind == "kpi":
                fmt = "currency"
            elif fmt == "currency":  # kind == "ratio"
                fmt = "ratio"
            higher_better = bool(raw.get("higher_better", True))
            threshold = raw.get("threshold")
            try:
                threshold = float(threshold) if threshold is not None else None
            except (TypeError, ValueError):
                threshold = None
            name = (raw.get("name") or "").strip()

        _validate_formula(formula)  # raises ValueError on unknown var / bad syntax
        return {
            "name": name,
            "kind": kind,
            "format": fmt,
            "formula": formula,
            "higher_better": higher_better,
            "threshold": threshold,
            "explanation": (raw.get("explanation") or "").strip() or None,
        }

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
