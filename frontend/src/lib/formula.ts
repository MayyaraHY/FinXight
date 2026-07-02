/**
 * Tiny, safe arithmetic formula engine for custom metrics.
 *
 * PREVIEW-ONLY / NON-AUTHORITATIVE. Displayed metric values are computed
 * server-side (backend app/services/metric_engine.py, which mirrors this file's
 * semantics exactly). The only remaining caller of `evalFormula` is the live
 * preview while editing a formula in CustomMetricModal; `validateFormula` still
 * backs the editor's inline validation. Keep this in sync with the backend
 * grammar (app/core/formula.py) — the parity tests guard the two.
 *
 * Supports: numbers, identifiers (variable names), + - * / and parentheses,
 * unary minus, and the functions abs(x), min(a, b), max(a, b). No `eval` /
 * `Function` — a hand-written tokenizer + shunting-yard parser, evaluated
 * against a variable map.
 *
 * Returns `null` (not NaN) when a referenced variable is null/missing, on a
 * division by zero, or on any parse error — so the UI can show "—".
 */

/** Supported functions and their (fixed) arity. */
export const FUNCTIONS: Record<string, number> = { abs: 1, min: 2, max: 2 };

type FuncName = keyof typeof FUNCTIONS;

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "func"; v: FuncName }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "u-" }
  | { t: "comma" }
  | { t: "lp" }
  | { t: "rp" };

const TOKEN_RE = /\s*([0-9]*\.?[0-9]+|[A-Za-z_][A-Za-z0-9_]*|[(),+\-*/])/y;

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < input.length) {
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(input);
    if (!m || m.index !== pos) return null;
    const raw = m[1];
    pos = TOKEN_RE.lastIndex;
    if (/^[0-9]/.test(raw) || raw.startsWith(".")) tokens.push({ t: "num", v: parseFloat(raw) });
    else if (/^[A-Za-z_]/.test(raw))
      tokens.push(raw in FUNCTIONS ? { t: "func", v: raw as FuncName } : { t: "id", v: raw });
    else if (raw === "(") tokens.push({ t: "lp" });
    else if (raw === ")") tokens.push({ t: "rp" });
    else if (raw === ",") tokens.push({ t: "comma" });
    else tokens.push({ t: "op", v: raw as "+" | "-" | "*" | "/" });
  }
  return tokens;
}

const PREC: Record<string, number> = { "u-": 3, "*": 2, "/": 2, "+": 1, "-": 1 };

// Shunting-yard → RPN. Detects unary minus by position.
function toRpn(tokens: Token[]): Token[] | null {
  const out: Token[] = [];
  const ops: Token[] = [];
  let prevValueLike = false; // was the previous token a value/`)` (so '-' is binary)?
  for (const tok of tokens) {
    if (tok.t === "num" || tok.t === "id") {
      out.push(tok);
      prevValueLike = true;
    } else if (tok.t === "func") {
      ops.push(tok);
      prevValueLike = false;
    } else if (tok.t === "comma") {
      while (ops.length && ops[ops.length - 1].t !== "lp") out.push(ops.pop()!);
      if (!ops.length) return null; // comma outside parentheses
      prevValueLike = false;
    } else if (tok.t === "op") {
      let op = tok.v;
      if (op === "-" && !prevValueLike) op = "u-";
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "op" && PREC[top.v] >= PREC[op]) out.push(ops.pop()!);
        else break;
      }
      ops.push({ t: "op", v: op });
      prevValueLike = false;
    } else if (tok.t === "lp") {
      ops.push(tok);
      prevValueLike = false;
    } else if (tok.t === "rp") {
      while (ops.length && ops[ops.length - 1].t !== "lp") out.push(ops.pop()!);
      if (!ops.length) return null; // unbalanced
      ops.pop(); // discard "("
      // A "(" directly preceded by a function name closes its argument list.
      if (ops.length && ops[ops.length - 1].t === "func") out.push(ops.pop()!);
      prevValueLike = true;
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op.t === "lp" || op.t === "func") return null; // unbalanced / function without (…)
    out.push(op);
  }
  return out;
}

const NULL = Symbol("null");
type Val = number | typeof NULL;

function evalRpn(rpn: Token[], vars: Record<string, number | null>): Val | null {
  const st: Val[] = [];
  for (const tok of rpn) {
    if (tok.t === "num") st.push(tok.v);
    else if (tok.t === "id") {
      const v = vars[tok.v];
      st.push(v == null || !Number.isFinite(v) ? NULL : v);
    } else if (tok.t === "func") {
      const arity = FUNCTIONS[tok.v];
      if (st.length < arity) return null;
      const args: Val[] = [];
      for (let i = 0; i < arity; i++) args.unshift(st.pop()!);
      if (args.some((a) => a === NULL)) {
        st.push(NULL);
        continue;
      }
      const nums = args as number[];
      let r: number;
      switch (tok.v) {
        case "abs": r = Math.abs(nums[0]); break;
        case "min": r = Math.min(nums[0], nums[1]); break;
        case "max": r = Math.max(nums[0], nums[1]); break;
        default: return null;
      }
      st.push(Number.isFinite(r) ? r : NULL);
    } else if (tok.t === "op") {
      if (tok.v === "u-") {
        if (!st.length) return null;
        const a = st.pop()!;
        st.push(a === NULL ? NULL : -a);
        continue;
      }
      if (st.length < 2) return null;
      const b = st.pop()!;
      const a = st.pop()!;
      if (a === NULL || b === NULL) {
        st.push(NULL);
        continue;
      }
      let r: number;
      switch (tok.v) {
        case "+": r = a + b; break;
        case "-": r = a - b; break;
        case "*": r = a * b; break;
        case "/": r = b === 0 ? NaN : a / b; break;
        default: return null;
      }
      st.push(Number.isFinite(r) ? r : NULL);
    }
  }
  if (st.length !== 1) return null;
  return st[0];
}

/** Evaluate a formula against a variable map. Returns null on any error/missing var. */
export function evalFormula(formula: string, vars: Record<string, number | null>): number | null {
  const tokens = tokenize(formula);
  if (!tokens || !tokens.length) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  const res = evalRpn(rpn, vars);
  return res == null || res === NULL ? null : res;
}

export interface FormulaValidation {
  ok: boolean;
  error?: string;
  usedVars: string[];
}

/** Validate syntax + that every identifier is in `allowedVars`. */
export function validateFormula(formula: string, allowedVars: string[]): FormulaValidation {
  if (!formula || !formula.trim()) return { ok: false, error: "Formule vide.", usedVars: [] };
  const tokens = tokenize(formula);
  if (!tokens) return { ok: false, error: "Caractère invalide dans la formule.", usedVars: [] };
  const allowed = new Set(allowedVars);
  const used: string[] = [];
  for (const tok of tokens) {
    if (tok.t === "id") {
      if (!allowed.has(tok.v)) return { ok: false, error: `Variable inconnue : ${tok.v}`, usedVars: used };
      if (!used.includes(tok.v)) used.push(tok.v);
    }
  }
  const rpn = toRpn(tokens);
  if (!rpn) return { ok: false, error: "Parenthèses ou opérateurs invalides.", usedVars: used };
  // Simulate the RPN stack depth to catch wrong arity / missing or extra
  // operands (e.g. `min(a,)`, `max(a, b, c)`) that parse but can't evaluate.
  let depth = 0;
  for (const tok of rpn) {
    if (tok.t === "num" || tok.t === "id") depth += 1;
    else if (tok.t === "func") {
      const arity = FUNCTIONS[tok.v];
      if (depth < arity) return { ok: false, error: `Arguments manquants pour ${tok.v}().`, usedVars: used };
      depth -= arity - 1;
    } else if (tok.t === "op") {
      const need = tok.v === "u-" ? 1 : 2;
      if (depth < need) return { ok: false, error: "Opérateur sans opérande.", usedVars: used };
      depth -= need - 1;
    }
  }
  if (depth !== 1) return { ok: false, error: "Formule incomplète.", usedVars: used };
  return { ok: true, usedVars: used };
}
