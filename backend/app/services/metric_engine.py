"""Authoritative server-side evaluator for custom-metric formulas.

Mirrors frontend/src/lib/formula.ts `evalFormula` semantics exactly: it reuses
the shared grammar (app.core.formula tokenizer + shunting-yard) and evaluates
the RPN with the same rules —

  * a referenced variable that is None / non-finite → the whole result is None,
  * division by zero → None,
  * any parse/structure error → None (never NaN, never an exception).

So the value the browser used to compute is now computed once, here, and both
engines are proven equivalent by the parity tests (frontend Vitest + backend
pytest).
"""

import math

from app.core import formula as grammar

# Sentinel distinct from a legitimate 0.0 result.
_NULL = object()


def _eval_rpn(rpn: list[tuple], variables: dict) -> object:
    st: list = []
    for tok in rpn:
        kind = tok[0]
        if kind == "num":
            st.append(tok[1])
        elif kind == "id":
            v = variables.get(tok[1])
            st.append(_NULL if v is None or not math.isfinite(v) else float(v))
        elif kind == "func":
            arity = grammar.FUNCTIONS[tok[1]]
            if len(st) < arity:
                return _NULL
            args = [st.pop() for _ in range(arity)][::-1]
            if any(a is _NULL for a in args):
                st.append(_NULL)
                continue
            name = tok[1]
            if name == "abs":
                r = abs(args[0])
            elif name == "min":
                r = min(args[0], args[1])
            elif name == "max":
                r = max(args[0], args[1])
            else:
                return _NULL
            st.append(r if math.isfinite(r) else _NULL)
        elif kind == "op":
            op = tok[1]
            if op == "u-":
                if not st:
                    return _NULL
                a = st.pop()
                st.append(_NULL if a is _NULL else -a)
                continue
            if len(st) < 2:
                return _NULL
            b = st.pop()
            a = st.pop()
            if a is _NULL or b is _NULL:
                st.append(_NULL)
                continue
            if op == "+":
                r = a + b
            elif op == "-":
                r = a - b
            elif op == "*":
                r = a * b
            elif op == "/":
                r = math.nan if b == 0 else a / b
            else:
                return _NULL
            st.append(r if math.isfinite(r) else _NULL)
    if len(st) != 1:
        return _NULL
    return st[0]


def evaluate(formula: str, variables: dict) -> float | None:
    """Evaluate `formula` against a variable map. Returns None on any missing
    variable, division by zero, or parse/structure error (mirrors evalFormula)."""
    try:
        tokens = grammar.tokenize(formula)
        if not tokens:
            return None
        rpn = grammar.to_rpn(tokens)
    except grammar.FormulaError:
        return None
    res = _eval_rpn(rpn, variables)
    return None if res is _NULL else float(res)
