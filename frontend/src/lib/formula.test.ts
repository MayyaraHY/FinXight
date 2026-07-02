import { describe, it, expect } from "vitest";
import { evalFormula, validateFormula } from "@/lib/formula";

// These cases mirror the backend engine parity tests
// (backend/tests/test_metric_engine.py) so the two evaluators stay equivalent.

const V: Record<string, number | null> = { a: 10, b: 4, c: 0, d: null, total_actif: 200 };
const ALLOWED = ["a", "b", "c", "d", "total_actif", "resultat_net", "capitaux_propres"];

describe("evalFormula — arithmetic", () => {
  it.each([
    ["a + b", 14],
    ["a - b", 6],
    ["a * b", 40],
    ["a / b", 2.5],
    ["a + b * 2", 18],
    ["(a + b) * 2", 28],
    ["-a + b", -6],
    ["abs(-a)", 10],
    ["min(a, b)", 4],
    ["max(a, b)", 10],
    ["min(a, max(b, 2))", 4],
    [".5 * a", 5],
  ])("%s = %d", (formula, expected) => {
    expect(evalFormula(formula, V)).toBeCloseTo(expected as number, 9);
  });
});

describe("evalFormula — returns null (never NaN / throws)", () => {
  it.each([
    "a / c", // division by zero
    "a + d", // null variable propagates
    "missing * a", // unknown variable
    "a +", // structural error
    "(a + b", // unbalanced
    "@@@", // stray chars
    "", // empty
  ])("%s → null", (formula) => {
    expect(evalFormula(formula, V)).toBeNull();
  });
});

describe("validateFormula", () => {
  it("accepts valid formulas + reports used vars", () => {
    const r = validateFormula("resultat_net / capitaux_propres", ALLOWED);
    expect(r.ok).toBe(true);
    expect(r.usedVars.sort()).toEqual(["capitaux_propres", "resultat_net"]);
  });

  it.each([
    ["foo / a", "Variable inconnue"],
    ["min(a)", "Arguments manquants"],
    ["max(a, b, c)", "incomplète"],
    ["a +", "opérande"],
    ["(a + b", "invalides"],
    ["", "vide"],
  ])("rejects %s", (formula) => {
    expect(validateFormula(formula, ALLOWED).ok).toBe(false);
  });
});
