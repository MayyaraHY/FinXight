"""
Canonical account-balance extraction shared by the calculation engines.

ONE sign convention for every supported CSV layout: **debit positive, credit
negative** (i.e. ``signed = debit - credit``). A credit-natured account (capital,
liabilities, revenue) is therefore negative; a debit-natured account (assets,
charges) is positive. This is what the bilan rules were designed around (e.g.
capital ``101`` arrives as a negative number and the "affectation" step negates it
back to a positive display value, and the ``DR``/``CR`` side filters become
meaningful again).

The previous per-engine ``get_balance`` returned the *signed* value for a single
``solde_final`` column but the *absolute* value for Sage split columns — so the same
account had opposite signs depending on the file format. This module removes that
contradiction by always returning ``debit - credit``.
"""

from decimal import Decimal


def _dec(value) -> Decimal:
    """Coerce a possibly-None numeric/string cell to Decimal (None -> 0)."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def signed_balance(acc) -> Decimal:
    """
    Return the account balance as ``debit - credit`` (credit-natured -> negative),
    uniformly across every supported source layout.

    Priority of source columns (first populated group wins):
      1. ``solde_final``                       — single signed closing balance
      2. ``solde_final_debit`` / ``_credit``   — Sage split closing balance (absolute per side)
      3. ``solde_debit`` / ``solde_credit``    — period balance
      4. ``debit`` / ``credit``                — raw movements
    """
    # 1. Single signed closing balance — already debit-positive / credit-negative.
    if getattr(acc, "solde_final", None) is not None:
        return _dec(acc.solde_final)

    # 2. Sage split closing balance: each side holds an absolute value; the signed
    #    balance is debit minus credit.
    sfd = getattr(acc, "solde_final_debit", None)
    sfc = getattr(acc, "solde_final_credit", None)
    if sfd is not None or sfc is not None:
        return _dec(sfd) - _dec(sfc)

    # 3. Period balance (older export format).
    sd = getattr(acc, "solde_debit", None)
    sc = getattr(acc, "solde_credit", None)
    if sd is not None or sc is not None:
        return _dec(sd) - _dec(sc)

    # 4. Raw movements (last resort).
    d = getattr(acc, "debit", None)
    c = getattr(acc, "credit", None)
    if d is not None or c is not None:
        return _dec(d) - _dec(c)

    return Decimal("0")
