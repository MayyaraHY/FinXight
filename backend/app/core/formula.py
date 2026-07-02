"""Safe arithmetic formula grammar — the server-side counterpart of
frontend/src/lib/formula.ts.

This module owns the *grammar*: tokenizer + shunting-yard (→ RPN) + a structural
validator with the same arity/stack-depth checks as the frontend
`validateFormula`. Keeping one grammar here (imported by both the metric
validator and, in Phase 2, the metric engine) means the server accepts and
rejects exactly what the client can evaluate — no drift, no formulas that pass
the server but evaluate to null forever in the browser.

Supported: numbers, identifiers, + - * / , parentheses, unary minus, and the
functions abs(x), min(a, b), max(a, b).
"""

import re

# Function name → arity. MUST match FUNCTIONS in frontend/src/lib/formula.ts.
FUNCTIONS: dict[str, int] = {"abs": 1, "min": 2, "max": 2}

# Operator precedence, incl. unary minus ("u-"). MUST match PREC in formula.ts.
_PREC: dict[str, int] = {"u-": 3, "*": 2, "/": 2, "+": 1, "-": 1}

# Number grammar mirrors formula.ts TOKEN_RE: `[0-9]*\.?[0-9]+` — accepts ".5"
# and "1.5" but not a trailing-dot "1." — followed by identifiers / operators.
_TOKEN_RE = re.compile(r"\s*([0-9]*\.?[0-9]+|[A-Za-z_][A-Za-z0-9_]*|[(),+\-*/])")

# Token representation: (kind, value?) tuples.
#   ("num", float) ("id", str) ("func", str) ("op", str) ("comma",) ("lp",) ("rp",)


class FormulaError(ValueError):
    """Invalid formula. Subclasses ValueError so existing `except ValueError`
    handlers (services/controllers) keep working."""


def tokenize(formula: str) -> list[tuple]:
    """Split into tokens. Raises FormulaError on any stray character."""
    tokens: list[tuple] = []
    pos = 0
    s = formula
    n = len(s)
    while pos < n:
        if s[pos].isspace():
            pos += 1
            continue
        m = _TOKEN_RE.match(s, pos)
        if not m:
            raise FormulaError(f"Caractère invalide dans la formule à la position {pos}.")
        raw = m.group(1)
        pos = m.end()
        if raw[0].isdigit() or raw[0] == ".":
            tokens.append(("num", float(raw)))
        elif raw[0].isalpha() or raw[0] == "_":
            tokens.append(("func", raw) if raw in FUNCTIONS else ("id", raw))
        elif raw == "(":
            tokens.append(("lp",))
        elif raw == ")":
            tokens.append(("rp",))
        elif raw == ",":
            tokens.append(("comma",))
        else:
            tokens.append(("op", raw))
    return tokens


def to_rpn(tokens: list[tuple]) -> list[tuple]:
    """Shunting-yard → RPN. Detects unary minus by position. Mirrors
    formula.ts toRpn. Raises FormulaError on unbalanced parens / stray comma."""
    out: list[tuple] = []
    ops: list[tuple] = []
    prev_value_like = False  # was the previous token a value / ")"?
    for tok in tokens:
        kind = tok[0]
        if kind in ("num", "id"):
            out.append(tok)
            prev_value_like = True
        elif kind == "func":
            ops.append(tok)
            prev_value_like = False
        elif kind == "comma":
            while ops and ops[-1][0] != "lp":
                out.append(ops.pop())
            if not ops:
                raise FormulaError("Virgule en dehors des parenthèses.")
            prev_value_like = False
        elif kind == "op":
            op = tok[1]
            if op == "-" and not prev_value_like:
                op = "u-"
            while ops:
                top = ops[-1]
                if top[0] == "op" and _PREC[top[1]] >= _PREC[op]:
                    out.append(ops.pop())
                else:
                    break
            ops.append(("op", op))
            prev_value_like = False
        elif kind == "lp":
            ops.append(tok)
            prev_value_like = False
        elif kind == "rp":
            while ops and ops[-1][0] != "lp":
                out.append(ops.pop())
            if not ops:
                raise FormulaError("Parenthèses déséquilibrées.")
            ops.pop()  # discard "("
            if ops and ops[-1][0] == "func":
                out.append(ops.pop())
            prev_value_like = True
    while ops:
        op = ops.pop()
        if op[0] in ("lp", "func"):
            raise FormulaError("Parenthèses déséquilibrées.")
        out.append(op)
    return out


def validate(formula: str, allowed_vars: set[str]) -> list[str]:
    """Validate syntax + that every identifier is allowed, and that the RPN has
    correct arity (mirrors frontend validateFormula's stack-depth simulation).

    Returns the list of used variable names. Raises FormulaError otherwise.
    """
    if not formula or not formula.strip():
        raise FormulaError("La formule est vide.")
    tokens = tokenize(formula)
    used: list[str] = []
    for tok in tokens:
        if tok[0] == "id":
            name = tok[1]
            if name not in allowed_vars and name not in FUNCTIONS:
                raise FormulaError(f"Variable inconnue : {name}")
            if name not in used:
                used.append(name)
    rpn = to_rpn(tokens)
    # Simulate stack depth to catch wrong arity / missing or extra operands.
    depth = 0
    for tok in rpn:
        kind = tok[0]
        if kind in ("num", "id"):
            depth += 1
        elif kind == "func":
            arity = FUNCTIONS[tok[1]]
            if depth < arity:
                raise FormulaError(f"Arguments manquants pour {tok[1]}().")
            depth -= arity - 1
        elif kind == "op":
            need = 1 if tok[1] == "u-" else 2
            if depth < need:
                raise FormulaError("Opérateur sans opérande.")
            depth -= need - 1
    if depth != 1:
        raise FormulaError("Formule incomplète.")
    return used
