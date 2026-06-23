"""
Standalone verification for the `variation_gross_only` cash-flow rule (no pytest).

Checks, against the REAL cashflow_rules.json + bilan_rules.json:
  * dot-paths in flux_investissement resolve to gross account prefixes
  * the resolved prefixes contain NO amortization account (281/291/2931/2937…)
  * the investment line = gross variation only, presented as an outflow (negative)
  * amortization movements in the TB are ignored

Run:  python backend/scripts/test_cashflow_gross.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.services.cashflow_service import CashFlowService  # noqa: E402

CORE = Path(__file__).resolve().parents[1] / "app" / "core"
cashflow_rules = json.loads((CORE / "cashflow_rules.json").read_text(encoding="utf-8"))
bilan_rules = json.loads((CORE / "bilan_rules.json").read_text(encoding="utf-8"))["bilan_comptable_tunisien"]

svc = CashFlowService(cashflow_rules, bilan_rules)

failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"{'✓' if cond else '✗'} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


# 1) Dot-paths resolve and exclude amortization accounts.
acq = cashflow_rules["flux_investissement"]["acquisition_immobilisations"]
resolved: list[str] = []
for path in acq["comptes_valeurs_brutes"]:
    resolved.extend(svc._resolve_codes(path))

check("dot-paths resolve to codes", len(resolved) > 0, f"{resolved}")
AMORT = {"281", "291", "2931", "2937", "282", "284", "292", "294", "295", "297"}
check("no amortization code in gross set", not (set(resolved) & AMORT), f"overlap={set(resolved) & AMORT}")
check("incorporel gross prefix present", "211" in resolved)
check("corporel gross prefix present", "221" in resolved)

# 2) Gross variation only, presented as outflow. 211→+50k gross; 281 amort must be ignored.
tb_n = {"21100000": 550_000.0, "28100000": 900_000.0}
tb_n_1 = {"21100000": 500_000.0, "28100000": 100_000.0}
section = svc._build_section(cashflow_rules["flux_investissement"], {}, {}, tb_n, tb_n_1)

line = section.lines[0]
check("investment line = -(gross delta) outflow", line.amount == -50_000.0, f"got {line.amount}")
check("section total matches", section.total == -50_000.0, f"got {section.total}")

# 3) Pure amortization movement does not affect the investment flow.
tb_only_amort_n = {"28100000": 900_000.0}
tb_only_amort_n_1 = {"28100000": 100_000.0}
section2 = svc._build_section(cashflow_rules["flux_investissement"], {}, {}, tb_only_amort_n, tb_only_amort_n_1)
check("amortization-only movement ignored", section2.lines[0].amount == 0.0, f"got {section2.lines[0].amount}")

# 4) Catch-all line forces reconciliation: sections + autres == variation de trésorerie.
res = svc.compute(
    resultat_net_n=-100_000.0,
    bilan_n={"actifs_courants.stocks": 50_000.0},
    bilan_n_minus_1={"actifs_courants.stocks": 70_000.0},
    tb_balances_n={"53100000": 40_000.0, "21100000": 600_000.0},
    tb_balances_n_1={"53100000": 90_000.0, "21100000": 500_000.0},
    period_flows_n={"681": 30_000.0},
)
total = res.exploitation.total + res.investissement.total + res.financement.total + res.autres.total
check("reconciliation_ok after catch-all", res.reconciliation_ok is True, f"ecart={res.reconciliation_ecart}")
check(
    "sections + autres == variation de trésorerie",
    abs(total - res.variation_tresorerie) < 0.01,
    f"total={total} vs var={res.variation_tresorerie}",
)
check("treasury (53/54) picked up", res.tresorerie_fin == 40_000.0, f"got {res.tresorerie_fin}")

# 5) Sign of tb_codes lines (raw signed_balance: liability = negative).
fin = cashflow_rules["flux_financement"]
# Rising short-term debt (50x more negative in N) → cash inflow (+).
sec_up = svc._build_section(fin, {}, {}, {"50100000": -300_000.0}, {"50100000": -100_000.0})
dct_up = next(l for l in sec_up.lines if "dettes" in l.label.lower())
check("rising liability → positive (inflow)", dct_up.amount == 200_000.0, f"got {dct_up.amount}")
# Falling short-term debt (repayment) → cash outflow (-).
sec_dn = svc._build_section(fin, {}, {}, {"50100000": -100_000.0}, {"50100000": -300_000.0})
dct_dn = next(l for l in sec_dn.lines if "dettes" in l.label.lower())
check("falling liability → negative (outflow)", dct_dn.amount == -200_000.0, f"got {dct_dn.amount}")

print()
if failures:
    print(f"FAILED: {len(failures)} — {failures}")
    sys.exit(1)
print("All cash-flow gross-only checks passed.")
