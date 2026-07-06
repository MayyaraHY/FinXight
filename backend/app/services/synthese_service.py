import json
import math
from pathlib import Path

from app.core.metric_variables import build_var_map
from app.services import metric_engine

_RULES_PATH = Path(__file__).resolve().parent.parent / "core" / "synthese_rules.json"
try:
    _RULES = json.loads(_RULES_PATH.read_text(encoding="utf-8"))
except Exception as exc:
    raise RuntimeError(f"synthese_rules.json missing or malformed: {exc}") from exc


def _match_band(value: float, bands: list[dict]) -> dict:
    """Return the first band whose [min, max) range contains value."""
    for band in bands:
        lo = band.get("min")
        hi = band.get("max")
        if lo is not None and value < lo:
            continue
        if hi is not None and value >= hi:
            continue
        return band
    # Fallback: last band (should not happen with well-formed rules)
    return bands[-1]


def _compute_health(var_map: dict) -> dict:
    health = {}
    for dim in _RULES["dimensions"]:
        key = dim["key"]
        formula_label = dim["formula_label"]
        value = metric_engine.evaluate(dim["formula"], var_map)

        if value is None or not math.isfinite(value):
            health[key] = {
                "value": None,
                "label": "Non calculable",
                "level": None,
                "formula_label": formula_label,
            }
            continue

        band = _match_band(value, dim["bands"])
        result = {
            "value": value,
            "label": band["label"],
            "level": band["level"],
            "formula_label": formula_label,
        }

        # Negative-equity override for autonomie_financiere
        if key == "autonomie_financiere":
            cp = var_map.get("capitaux_propres")
            if cp is not None and math.isfinite(cp) and cp < 0:
                result["label"] = "Fonds propres négatifs"
                result["level"] = "bad"

        health[key] = result
    return health


def _delta_pct(a, b) -> dict:
    delta = None
    pct = None
    if a is not None and b is not None:
        delta = b - a
        if a != 0:
            pct = round((b - a) / abs(a) * 100, 2)
    return {"delta": delta, "pct": pct}


def _compute_key_points(var_map_n: dict, var_map_n1: dict, year_prev: int) -> list:
    noise_pct = _RULES.get("key_point_noise_pct", 1.0)
    points = []
    for metric_def in _RULES["key_point_metrics"]:
        key = metric_def["key"]
        higher_better = metric_def["higher_better"]
        b = var_map_n.get(key)
        a = var_map_n1.get(key)

        if a is None or b is None:
            continue

        dp = _delta_pct(a, b)
        delta = dp["delta"]
        pct = dp["pct"]

        if delta is None:
            direction = None
            sentiment = None
        elif delta > 0:
            direction = "up"
        elif delta < 0:
            direction = "down"
        else:
            direction = None

        if pct is None or direction is None:
            sentiment = None
        elif abs(pct) < noise_pct:
            sentiment = "neutral"
        elif (direction == "up" and higher_better) or (direction == "down" and not higher_better):
            sentiment = "positive"
        else:
            sentiment = "negative"

        points.append({
            "metric": key,
            "delta_pct": pct,
            "direction": direction,
            "sentiment": sentiment,
            "basis": f"vs {year_prev}",
        })
    return points


def compute_synthese(periods: list[dict], year: int, year_prev: int | None = None) -> dict | None:
    period_n = next((p for p in periods if p.get("period_year") == year), None)
    if period_n is None:
        return None

    var_map_n = build_var_map(period_n)
    assert "dettes" in var_map_n, "build_var_map must expose 'dettes' derived variable"

    health = _compute_health(var_map_n)

    key_points: list = []
    if year_prev is not None:
        period_n1 = next((p for p in periods if p.get("period_year") == year_prev), None)
        if period_n1 is not None:
            var_map_n1 = build_var_map(period_n1)
            key_points = _compute_key_points(var_map_n, var_map_n1, year_prev)

    return {
        "year": year,
        "year_prev": year_prev,
        "health": health,
        "key_points": key_points,
        "narration": None,
    }
