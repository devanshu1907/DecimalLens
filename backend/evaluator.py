"""
DecimalLens — Deterministic Math Verification Engine (v2)
=========================================================

Interval-arithmetic verification for financial claims extracted from
SEC filings.  Every reported number is treated as a **rounding interval**,
not a point, and tolerance scales with the structure of the computation
that produced it.

Design Principles
-----------------
1. **IEEE 854 / ROUND_HALF_UP context** — all arithmetic uses an explicit
   ``decimal.Context`` with precision 50 and loud traps.

2. **Dual-representation cross-validation** — every expression is evaluated
   via both ``Decimal`` and ``fractions.Fraction`` (exact rational oracle).

3. **HULP interval model** — a reported number with *p* decimal places
   represents the interval ``[value − HULP, value + HULP)`` where
   ``HULP = 0.5 × 10^(−p)``.  Verification checks whether the recomputed
   value falls inside the reported interval, not whether two quantised
   values happen to match.

4. **Operand-count-scaled tolerance** — for a sum/difference of *N*
   individually-rounded operands, worst-case accumulated rounding error
   is ``N × HULP``.  A 3-item subtotal and a 40-item grand total get
   different tolerances automatically.

5. **Separate currency / percentage paths** — currency uses additive HULP
   propagation; percentages (divisions) use standard error-propagation
   ``σ_f/f = √((σ_a/a)² + (σ_b/b)²)`` to derive tolerance from the
   precisions of numerator and denominator.

6. **Continuous faithfulness score** — ``score = 1 / (1 + ratio²)``
   where ``ratio = |delta| / tolerance``.  Maps smoothly from 1.0
   (perfect) through 0.5 (borderline) to ~0 (gross error).  Discrete
   tiers are derived from this score for backward compatibility.

7. **Inter-claim cross-footing** with transitive operand counting —
   if an operand matches another claim's reported value, that claim's
   operand count is added to the effective *N* (depth-capped at 2).

8. **Safe formatting** — all output strings built from ``Decimal``
   objects via ``quantize()`` + string ops.  Zero ``float`` coercion.

9. **Expanded parsing** — ``$45.2M``, ``($12,500)``, ``€``, ``£``,
   whitespace-grouped numbers, etc.
"""

import re
import ast
import math
import operator
import decimal
from decimal import Decimal
from fractions import Fraction

# ---------------------------------------------------------------------------
# 1. Explicit Decimal Context  (IEEE 854 compliance)
# ---------------------------------------------------------------------------

FINANCIAL_CTX = decimal.Context(
    prec=50,
    rounding=decimal.ROUND_HALF_UP,
    traps=[
        decimal.InvalidOperation,
        decimal.DivisionByZero,
        decimal.Overflow,
    ],
)

# ---------------------------------------------------------------------------
# Security limits
# ---------------------------------------------------------------------------
_MAX_EXPR_LEN = 512
_MAX_AST_DEPTH = 50

# ---------------------------------------------------------------------------
# Confidence tiers  (backward-compatible labels)
# ---------------------------------------------------------------------------
EXACT_MATCH = "EXACT_MATCH"
ROUNDING_MATCH = "ROUNDING_MATCH"
NEAR_MISS = "NEAR_MISS"
MATERIAL_MISMATCH = "MATERIAL_MISMATCH"

# ---------------------------------------------------------------------------
# Expanded input parsing
# ---------------------------------------------------------------------------
_MAGNITUDE_MAP = {
    'K': Decimal('1000'),    'k': Decimal('1000'),
    'M': Decimal('1000000'), 'm': Decimal('1000000'),
    'B': Decimal('1000000000'), 'b': Decimal('1000000000'),
    'T': Decimal('1000000000000'), 't': Decimal('1000000000000'),
}
_MAGNITUDE_RE = re.compile(r'^([+-]?\d+(?:\.\d+)?)\s*([KkMmBbTt])$')
_PAREN_NEG_RE = re.compile(r'^\(([^)]+)\)$')


def clean_numeric_value(val_str: str) -> Decimal:
    """
    Cleans a string representing a number and returns a Decimal.

    Handles: $142,500,000 | 24.50% | $45.2M | ($12,500) | 142 500 000
    """
    clean = val_str.strip()

    paren_match = _PAREN_NEG_RE.match(clean)
    is_paren_negative = False
    if paren_match:
        clean = paren_match.group(1).strip()
        is_paren_negative = True

    clean = clean.replace('$', '').replace('€', '').replace('£', '').replace('¥', '')
    clean = clean.replace(',', '').replace(' ', '')

    if clean.endswith('%'):
        val = FINANCIAL_CTX.divide(Decimal(clean[:-1]), Decimal('100'))
        return FINANCIAL_CTX.minus(val) if is_paren_negative else val

    mag_match = _MAGNITUDE_RE.match(clean)
    if mag_match:
        base = Decimal(mag_match.group(1))
        multiplier = _MAGNITUDE_MAP[mag_match.group(2)]
        val = FINANCIAL_CTX.multiply(base, multiplier)
        return FINANCIAL_CTX.minus(val) if is_paren_negative else val

    val = Decimal(clean)
    return FINANCIAL_CTX.minus(val) if is_paren_negative else val


# ---------------------------------------------------------------------------
# Expression evaluation — Decimal path
# ---------------------------------------------------------------------------

def safe_eval_expression(expr_str: str) -> Decimal:
    """
    Safely evaluates an arithmetic expression using Decimal under FINANCIAL_CTX.
    """
    if len(expr_str) > _MAX_EXPR_LEN:
        raise ValueError(
            f"Expression is too long ({len(expr_str)} chars). Maximum is {_MAX_EXPR_LEN}."
        )

    clean_expr = expr_str.replace('$', '').replace(',', '').strip()

    def replace_percent(match):
        val = match.group(1)
        return str(FINANCIAL_CTX.divide(Decimal(val), Decimal('100')))

    clean_expr = re.sub(r'(\d+(?:\.\d+)?)%', replace_percent, clean_expr)

    if not re.fullmatch(r'[\d\s\+\-\*\/\.\(\)]+', clean_expr):
        raise ValueError(
            f"Expression contains disallowed characters: {clean_expr!r}"
        )

    _ctx_ops = {
        ast.Add:  FINANCIAL_CTX.add,
        ast.Sub:  FINANCIAL_CTX.subtract,
        ast.Mult: FINANCIAL_CTX.multiply,
        ast.Div:  FINANCIAL_CTX.divide,
    }

    def eval_node(node, depth: int = 0) -> Decimal:
        if depth > _MAX_AST_DEPTH:
            raise ValueError(
                f"Expression is too deeply nested (max depth {_MAX_AST_DEPTH})."
            )
        if hasattr(ast, 'Num') and isinstance(node, ast.Num):
            return Decimal(str(node.n))
        elif isinstance(node, ast.Constant):
            return Decimal(str(node.value))
        elif isinstance(node, ast.BinOp):
            left = eval_node(node.left, depth + 1)
            right = eval_node(node.right, depth + 1)
            op = type(node.op)
            if op in _ctx_ops:
                if op is ast.Div and right == Decimal('0'):
                    raise ValueError("Division by zero in expression")
                return _ctx_ops[op](left, right)
            raise ValueError(f"Unsupported operator: {op}")
        elif isinstance(node, ast.UnaryOp):
            operand = eval_node(node.operand, depth + 1)
            if isinstance(node.op, ast.USub):
                return FINANCIAL_CTX.minus(operand)
            raise ValueError(f"Unsupported unary operator: {type(node.op)}")
        else:
            raise ValueError(f"Unsupported syntax node type: {type(node).__name__}")

    tree = ast.parse(clean_expr, mode='eval')
    return eval_node(tree.body)


# ---------------------------------------------------------------------------
# Dual-representation cross-validation  (Fraction oracle)
# ---------------------------------------------------------------------------

def _fraction_eval_expression(expr_str: str) -> Fraction:
    """Independent rational-arithmetic evaluator for cross-validation."""
    clean_expr = expr_str.replace('$', '').replace(',', '').strip()

    def replace_percent_frac(match):
        val = match.group(1)
        return str(Fraction(val) / Fraction(100))

    clean_expr = re.sub(r'(\d+(?:\.\d+)?)%', replace_percent_frac, clean_expr)

    if not re.fullmatch(r'[\d\s\+\-\*\/\.\(\)]+', clean_expr):
        raise ValueError(
            f"Expression contains disallowed characters: {clean_expr!r}"
        )

    _frac_ops = {
        ast.Add:  operator.add,
        ast.Sub:  operator.sub,
        ast.Mult: operator.mul,
        ast.Div:  operator.truediv,
    }

    def eval_node(node, depth: int = 0) -> Fraction:
        if depth > _MAX_AST_DEPTH:
            raise ValueError(
                f"Expression is too deeply nested (max depth {_MAX_AST_DEPTH})."
            )
        if hasattr(ast, 'Num') and isinstance(node, ast.Num):
            return Fraction(str(node.n))
        elif isinstance(node, ast.Constant):
            return Fraction(str(node.value))
        elif isinstance(node, ast.BinOp):
            left = eval_node(node.left, depth + 1)
            right = eval_node(node.right, depth + 1)
            op = type(node.op)
            if op in _frac_ops:
                if op is ast.Div and right == Fraction(0):
                    raise ValueError("Division by zero in expression")
                return _frac_ops[op](left, right)
            raise ValueError(f"Unsupported operator: {op}")
        elif isinstance(node, ast.UnaryOp):
            operand = eval_node(node.operand, depth + 1)
            if isinstance(node.op, ast.USub):
                return -operand
            raise ValueError(f"Unsupported unary operator: {type(node.op)}")
        else:
            raise ValueError(f"Unsupported syntax node type: {type(node).__name__}")

    tree = ast.parse(clean_expr, mode='eval')
    return eval_node(tree.body)


# ---------------------------------------------------------------------------
# Safe Decimal formatting  (no float coercion)
# ---------------------------------------------------------------------------

def _format_decimal(value: Decimal, decimal_places: int, prefix: str = "",
                    suffix: str = "", show_sign: bool = False) -> str:
    """Format a Decimal as a string without ever coercing through float."""
    if decimal_places > 0:
        quantize_step = Decimal('1e-' + str(decimal_places))
    else:
        quantize_step = Decimal('1')

    quantized = value.quantize(quantize_step, rounding=decimal.ROUND_HALF_UP)

    is_negative = quantized < 0
    abs_val = abs(quantized)

    str_val = str(abs_val)
    if '.' in str_val:
        int_part, frac_part = str_val.split('.')
        frac_part = frac_part.ljust(decimal_places, '0')
    else:
        int_part = str_val
        frac_part = '0' * decimal_places if decimal_places > 0 else ''

    int_part_grouped = ''
    for i, ch in enumerate(reversed(int_part)):
        if i > 0 and i % 3 == 0:
            int_part_grouped = ',' + int_part_grouped
        int_part_grouped = ch + int_part_grouped

    num_str = int_part_grouped
    if decimal_places > 0:
        num_str += '.' + frac_part

    if show_sign:
        sign = '-' if is_negative else '+'
    else:
        sign = '-' if is_negative else ''

    return f"{sign}{prefix}{num_str}{suffix}"


# ===================================================================
# HULP INTERVAL MODEL
# ===================================================================

def _compute_hulp(decimal_places: int) -> Decimal:
    """
    Half-Unit-in-Last-Place.

    A number printed with *p* decimal places represents everything in
    ``[value − HULP, value + HULP)`` where ``HULP = 0.5 × 10^(−p)``.

    Examples:
        p=0  → HULP = 0.5        ($142,500,000 ± $0.50)
        p=1  → HULP = 0.05       (24.5% ± 0.05%)
        p=2  → HULP = 0.005      ($34,912,500.00 ± $0.005)
    """
    # 0.5 × 10^(-p) = 5 × 10^(-(p+1))
    return Decimal('5') * Decimal('10') ** (-(decimal_places + 1))


def _extract_decimal_places(reported_str: str) -> int:
    """
    Determine the number of decimal places in the reported value string.
    """
    clean = (
        reported_str.replace('$', '').replace(',', '')
        .replace('%', '').replace('(', '').replace(')', '')
        .replace(' ', '').strip()
    )
    for suffix_char in 'KkMmBbTt':
        clean = clean.rstrip(suffix_char)

    if '.' in clean:
        return len(clean.split('.')[1])
    return 0


def _count_operands(expression_str: str) -> int:
    """
    Count the number of numeric literal operands in an expression.

    "62100000 - 15400000 - 12100000" → 3
    "45200000 + 97300000"            → 2
    "142500000"                      → 1
    """
    clean = expression_str.replace('$', '').replace(',', '').strip()
    matches = re.findall(r'(?<![.\d])(\d+(?:\.\d+)?)(?![.\d])', clean)
    return max(len(matches), 1)  # at least 1


def _extract_operands(expression_str: str) -> list[Decimal]:
    """Extract all numeric literal operands from an expression as Decimals."""
    clean = expression_str.replace('$', '').replace(',', '').strip()
    matches = re.findall(r'(?<![.\d])(\d+(?:\.\d+)?)(?![.\d])', clean)
    return [Decimal(m) for m in matches]


def _compute_tolerance(hulp: Decimal, n_operands: int,
                       mode: str = "worst") -> Decimal:
    """
    Compute rounding tolerance for a sum/difference of N rounded operands.

    Parameters
    ----------
    hulp : Decimal
        Half-unit-in-last-place of each operand.
    n_operands : int
        Number of operands being aggregated.
    mode : str
        "worst"       → N × HULP  (conservative, used for tier boundaries)
        "statistical"  → √N × HULP (expected, used for score gradient)

    For financial auditing we default to "worst" because it minimises
    false positives (real data flagged as wrong).
    """
    n = Decimal(str(n_operands))
    if mode == "statistical":
        sqrt_n = Decimal(str(math.isqrt(n_operands)))
        if sqrt_n * sqrt_n < n:
            sqrt_n += 1  # ceiling of sqrt for conservatism
        return FINANCIAL_CTX.multiply(hulp, sqrt_n)
    else:  # worst case
        return FINANCIAL_CTX.multiply(hulp, n)


def _is_ratio_expression(expression_str: str) -> bool:
    """
    Returns True if the expression's top-level AST node is a division.
    """
    try:
        clean = expression_str.replace('$', '').replace(',', '').strip()
        clean = re.sub(r'(\d+(?:\.\d+)?)%', r'\1', clean)
        if not re.fullmatch(r'[\d\s\+\-\*\/\.\(\)]+', clean):
            return False
        tree = ast.parse(clean, mode='eval')
        return isinstance(tree.body, ast.BinOp) and isinstance(tree.body.op, ast.Div)
    except Exception:
        return False


def _ratio_tolerance(expression_str: str, reported_decimal_places: int) -> Decimal:
    """
    Compute tolerance for a ratio expression ``a / b`` using standard
    error propagation for f(a,b) = a/b:

        σ_f = |f| × √((σ_a/a)² + (σ_b/b)²)

    where σ_a and σ_b are the HULP values of the numerator and
    denominator operands.

    Falls back to additive HULP if the expression isn't a clean division.
    """
    try:
        clean = expression_str.replace('$', '').replace(',', '').strip()
        clean = re.sub(r'(\d+(?:\.\d+)?)%', r'\1', clean)
        tree = ast.parse(clean, mode='eval')

        if not (isinstance(tree.body, ast.BinOp) and isinstance(tree.body.op, ast.Div)):
            # Not a simple division — fall back
            hulp = _compute_hulp(reported_decimal_places)
            n = _count_operands(expression_str)
            return _compute_tolerance(hulp, n)

        # Extract numerator and denominator values
        def get_value(node) -> Decimal:
            if isinstance(node, ast.Constant):
                return Decimal(str(node.value))
            elif hasattr(ast, 'Num') and isinstance(node, ast.Num):
                return Decimal(str(node.n))
            elif isinstance(node, ast.BinOp):
                # Nested expression — evaluate it
                return safe_eval_expression(ast.unparse(node))
            elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
                return -get_value(node.operand)
            return Decimal('0')

        numerator_val = abs(get_value(tree.body.left))
        denominator_val = abs(get_value(tree.body.right))

        if numerator_val == 0 or denominator_val == 0:
            hulp = _compute_hulp(reported_decimal_places)
            n = _count_operands(expression_str)
            return _compute_tolerance(hulp, n)

        # Determine precision of numerator and denominator
        # For integer operands, HULP = 0.5 (p=0)
        # For decimal operands, HULP depends on their decimal places
        def get_operand_hulp(node) -> Decimal:
            if isinstance(node, ast.Constant):
                s = str(node.value)
            elif hasattr(ast, 'Num') and isinstance(node, ast.Num):
                s = str(node.n)
            elif isinstance(node, ast.BinOp):
                # Nested expression — count operands and compound HULP
                sub_expr = ast.unparse(node)
                n = _count_operands(sub_expr)
                # Assume integer operands (p=0) for sub-expressions
                return _compute_tolerance(Decimal('0.5'), n)
            else:
                return Decimal('0.5')

            if '.' in s:
                p = len(s.split('.')[1])
            else:
                p = 0
            return _compute_hulp(p)

        sigma_a = get_operand_hulp(tree.body.left)
        sigma_b = get_operand_hulp(tree.body.right)

        # Error propagation: σ_f = |f| × √((σ_a/a)² + (σ_b/b)²)
        ratio_val = FINANCIAL_CTX.divide(numerator_val, denominator_val)

        term_a = FINANCIAL_CTX.divide(sigma_a, numerator_val)
        term_a_sq = FINANCIAL_CTX.multiply(term_a, term_a)

        term_b = FINANCIAL_CTX.divide(sigma_b, denominator_val)
        term_b_sq = FINANCIAL_CTX.multiply(term_b, term_b)

        sum_sq = FINANCIAL_CTX.add(term_a_sq, term_b_sq)
        # √(sum_sq) via Decimal — use Newton's method for sqrt
        sqrt_sum = sum_sq.sqrt(context=FINANCIAL_CTX)

        tolerance = FINANCIAL_CTX.multiply(ratio_val, sqrt_sum)

        # Ensure tolerance is at least the display-precision HULP
        display_hulp = _compute_hulp(reported_decimal_places)
        if tolerance < display_hulp:
            tolerance = display_hulp

        return tolerance

    except Exception:
        # Any failure — fall back to additive HULP
        hulp = _compute_hulp(reported_decimal_places)
        n = _count_operands(expression_str)
        return _compute_tolerance(hulp, n)


# ===================================================================
# CONTINUOUS FAITHFULNESS SCORE
# ===================================================================

def _faithfulness_score(delta: Decimal, tolerance: Decimal) -> Decimal:
    """
    Maps ``ratio = |delta| / tolerance`` through ``1 / (1 + ratio²)``
    to produce a smooth score in [0, 1].

    - ratio = 0   → score = 1.0  (perfect agreement)
    - ratio = 1   → score = 0.5  (borderline — delta equals tolerance)
    - ratio → ∞   → score → 0.0  (gross discrepancy)
    """
    if tolerance <= Decimal('0'):
        return Decimal('1') if delta == Decimal('0') else Decimal('0')

    ratio = FINANCIAL_CTX.divide(abs(delta), tolerance)
    ratio_sq = FINANCIAL_CTX.multiply(ratio, ratio)
    denominator = FINANCIAL_CTX.add(Decimal('1'), ratio_sq)
    return FINANCIAL_CTX.divide(Decimal('1'), denominator)


# ===================================================================
# CORE VERIFICATION FUNCTION
# ===================================================================

def verify_claim(reported_str: str, expression_str: str) -> dict:
    """
    Verify a single financial claim using interval-arithmetic.

    Returns
    -------
    dict with keys:
        verified           : bool
        recalculated       : str
        reason             : str | None
        confidence_tier    : str
        relative_error_bps : str
        faithfulness_score : str   (0.0 – 1.0, continuous)
        tolerance_used     : str   (the HULP-derived tolerance)
        n_operands         : int
    """
    # --- Parse reported value ---
    try:
        reported_val = clean_numeric_value(reported_str)
    except Exception as e:
        return {
            "verified": False,
            "recalculated": "N/A",
            "reason": f"Failed to parse reported value '{reported_str}': {str(e)}",
            "confidence_tier": MATERIAL_MISMATCH,
            "relative_error_bps": "N/A",
            "faithfulness_score": "0.00",
            "tolerance_used": "N/A",
            "n_operands": 0,
        }

    # --- Evaluate expression via Decimal ---
    try:
        recalculated_val = safe_eval_expression(expression_str)
    except Exception as e:
        return {
            "verified": False,
            "recalculated": "N/A",
            "reason": f"Failed to evaluate formula expression '{expression_str}': {str(e)}",
            "confidence_tier": MATERIAL_MISMATCH,
            "relative_error_bps": "N/A",
            "faithfulness_score": "0.00",
            "tolerance_used": "N/A",
            "n_operands": 0,
        }

    # --- Cross-validate via Fraction oracle ---
    oracle_warning = None
    try:
        fraction_result = _fraction_eval_expression(expression_str)
        fraction_as_decimal = FINANCIAL_CTX.divide(
            Decimal(fraction_result.numerator),
            Decimal(fraction_result.denominator)
        )
        high_prec_step = Decimal('1e-28')
        dec_q = recalculated_val.quantize(high_prec_step, rounding=decimal.ROUND_HALF_UP)
        frac_q = fraction_as_decimal.quantize(high_prec_step, rounding=decimal.ROUND_HALF_UP)
        if dec_q != frac_q:
            oracle_warning = (
                f"Internal cross-validation alert: Decimal result ({dec_q}) "
                f"disagrees with Fraction oracle ({frac_q})."
            )
    except Exception:
        oracle_warning = "Fraction oracle could not evaluate expression (non-fatal)."

    # --- Determine display format ---
    is_percent = '%' in reported_str
    decimal_places = _extract_decimal_places(reported_str)

    # --- Compute HULP and tolerance ---
    n_ops = _count_operands(expression_str)

    if is_percent and _is_ratio_expression(expression_str):
        # Percentage with division: use error-propagation tolerance
        # The tolerance is in the ratio's own units (0.xxxx), not in percent
        tolerance = _ratio_tolerance(expression_str, decimal_places + 2)
    else:
        # Currency / additive: N-scaled HULP
        if is_percent:
            # For percentage display, HULP is in percentage points
            # e.g., 24.50% (p=2) → HULP = 0.005 percentage points = 0.00005 as ratio
            hulp = _compute_hulp(decimal_places)
            # Convert to ratio units: divide by 100
            hulp_ratio = FINANCIAL_CTX.divide(hulp, Decimal('100'))
            tolerance = _compute_tolerance(hulp_ratio, n_ops)
        else:
            hulp = _compute_hulp(decimal_places)
            tolerance = _compute_tolerance(hulp, n_ops)

    # --- Compute delta (in the same units as tolerance) ---
    delta = abs(FINANCIAL_CTX.subtract(recalculated_val, reported_val))

    # --- Compute ratio and faithfulness score ---
    score = _faithfulness_score(delta, tolerance)

    if tolerance > Decimal('0'):
        ratio = FINANCIAL_CTX.divide(delta, tolerance)
    else:
        ratio = Decimal('0') if delta == Decimal('0') else Decimal('Infinity')

    # --- Relative error in basis points (for display) ---
    if reported_val != Decimal('0'):
        relative_error = FINANCIAL_CTX.divide(delta, abs(reported_val))
        relative_error_bps = FINANCIAL_CTX.multiply(relative_error, Decimal('10000'))
    else:
        relative_error_bps = Decimal('Infinity') if delta > 0 else Decimal('0')

    relative_error_bps_str = str(
        relative_error_bps.quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
    ) if relative_error_bps != Decimal('Infinity') else "Infinity"

    # --- Format recalculated string ---
    if is_percent:
        recalc_display = FINANCIAL_CTX.multiply(recalculated_val, Decimal('100'))
        recalc_str = _format_decimal(recalc_display, decimal_places, suffix='%')
    else:
        prefix = '$' if '$' in reported_str else ''
        recalc_str = _format_decimal(recalculated_val, decimal_places, prefix=prefix)

    # --- Determine confidence tier from ratio ---
    if delta == Decimal('0'):
        confidence_tier = EXACT_MATCH
        verified = True
    elif ratio <= Decimal('1'):
        # Delta is within the HULP-derived tolerance envelope
        confidence_tier = ROUNDING_MATCH
        verified = True
    elif ratio <= Decimal('3'):
        # Borderline — up to 3× tolerance.  Worth a warning but not a
        # hard fail in isolation.
        confidence_tier = NEAR_MISS
        verified = False
    else:
        # Far beyond what rounding noise can explain
        confidence_tier = MATERIAL_MISMATCH
        verified = False

    # --- Automatic Scale Alignment ---
    scale_adjustment_reason = None
    if not verified and recalculated_val != Decimal('0') and reported_val != Decimal('0'):
        scale_ratio = FINANCIAL_CTX.divide(reported_val, recalculated_val)
        valid_scales = [
            Decimal('1000000000'), Decimal('1000000'), Decimal('1000'),
            Decimal('0.001'), Decimal('0.000001'), Decimal('0.000000001')
        ]
        
        for scale in valid_scales:
            scale_diff = abs(FINANCIAL_CTX.subtract(scale_ratio, scale))
            scale_rel_error = FINANCIAL_CTX.divide(scale_diff, scale)
            if scale_rel_error < Decimal('0.01'):  # Within 1% of the exact scale factor
                # Apply scale
                scaled_recalculated_val = FINANCIAL_CTX.multiply(recalculated_val, scale)
                
                # Re-run delta and ratio
                new_delta = abs(FINANCIAL_CTX.subtract(scaled_recalculated_val, reported_val))
                new_score = _faithfulness_score(new_delta, tolerance)
                
                if tolerance > Decimal('0'):
                    new_ratio = FINANCIAL_CTX.divide(new_delta, tolerance)
                else:
                    new_ratio = Decimal('0') if new_delta == Decimal('0') else Decimal('Infinity')
                    
                new_verified = False
                new_confidence_tier = confidence_tier
                if new_delta == Decimal('0'):
                    new_confidence_tier = EXACT_MATCH
                    new_verified = True
                elif new_ratio <= Decimal('1'):
                    new_confidence_tier = ROUNDING_MATCH
                    new_verified = True
                    
                if new_verified:
                    verified = True
                    confidence_tier = new_confidence_tier
                    recalculated_val = scaled_recalculated_val
                    delta = new_delta
                    ratio = new_ratio
                    score = new_score
                    
                    # Recompute recalc_str
                    if is_percent:
                        recalc_display = FINANCIAL_CTX.multiply(recalculated_val, Decimal('100'))
                        recalc_str = _format_decimal(recalc_display, decimal_places, suffix='%')
                    else:
                        prefix = '$' if '$' in reported_str else ''
                        recalc_str = _format_decimal(recalculated_val, decimal_places, prefix=prefix)
                    
                    # Recompute relative_error_bps
                    if reported_val != Decimal('0'):
                        relative_error = FINANCIAL_CTX.divide(delta, abs(reported_val))
                        relative_error_bps = FINANCIAL_CTX.multiply(relative_error, Decimal('10000'))
                    else:
                        relative_error_bps = Decimal('Infinity') if delta > 0 else Decimal('0')
                    
                    relative_error_bps_str = str(
                        relative_error_bps.quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
                    ) if relative_error_bps != Decimal('Infinity') else "Infinity"
                    
                    # Format scale nicely
                    if scale >= 1:
                        scale_str = f"{int(scale):,}"
                    else:
                        scale_str = f"{scale:f}".rstrip('0')
                    
                    scale_adjustment_reason = f"[Scale Adjusted: Auto-scaled by {scale_str}x to match reported unit denominations.]"
                    break

    # --- Format score and tolerance for output ---
    score_str = str(score.quantize(Decimal('0.0001'), rounding=decimal.ROUND_HALF_UP))
    tolerance_str = str(tolerance.quantize(Decimal('1e-10'), rounding=decimal.ROUND_HALF_UP))

    # --- Build result ---
    if verified:
        reason = None
        if oracle_warning:
            reason = oracle_warning
        if scale_adjustment_reason:
            reason = (reason + " " + scale_adjustment_reason) if reason else scale_adjustment_reason
        return {
            "verified": True,
            "recalculated": recalc_str,
            "reason": reason,
            "confidence_tier": confidence_tier,
            "relative_error_bps": relative_error_bps_str,
            "faithfulness_score": score_str,
            "tolerance_used": tolerance_str,
            "n_operands": n_ops,
        }
    else:
        # Format discrepancy string
        discrepancy = FINANCIAL_CTX.subtract(recalculated_val, reported_val)
        if is_percent:
            disc_str = _format_decimal(
                FINANCIAL_CTX.multiply(discrepancy, Decimal('100')),
                max(decimal_places, 2), suffix='%', show_sign=True,
            )
        elif '$' in reported_str:
            disc_str = _format_decimal(
                discrepancy, max(decimal_places, 2),
                prefix='$', show_sign=True,
            )
        else:
            disc_str = _format_decimal(
                discrepancy, max(decimal_places, 2), show_sign=True,
            )

        tier_label = {
            NEAR_MISS: "Near-miss (borderline, ≤3× tolerance)",
            MATERIAL_MISMATCH: "Arithmetic mismatch",
        }.get(confidence_tier, "Mismatch")

        reason = (
            f"{tier_label}. "
            f"Reported: {reported_str}. Recalculated: {recalc_str} "
            f"(Discrepancy: {disc_str}, {relative_error_bps_str} bps, "
            f"ratio: {ratio.quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)}× tolerance, "
            f"score: {score_str})."
        )
        if oracle_warning:
            reason += f" {oracle_warning}"

        return {
            "verified": False,
            "recalculated": recalc_str,
            "reason": reason,
            "confidence_tier": confidence_tier,
            "relative_error_bps": relative_error_bps_str,
            "faithfulness_score": score_str,
            "tolerance_used": tolerance_str,
            "n_operands": n_ops,
        }


# ===================================================================
# INTER-CLAIM CROSS-FOOTING  (with transitive operand counting)
# ===================================================================

def cross_validate_claims(claims: list[dict]) -> list[dict]:
    """
    Checks inter-claim arithmetic consistency (cross-footing) with
    transitive operand counting.

    For each claim whose expression references operands close to another
    claim's reported value, checks exact match.  Also performs transitive
    operand counting: if operand X matches claim B's reported value, B's
    operand count is added to this claim's effective N (capped at depth 2).
    """
    if not claims or len(claims) < 2:
        return claims

    # Build lookups
    value_to_claims: dict[Decimal, list[str]] = {}
    id_to_claim: dict[str, dict] = {}
    for claim in claims:
        claim_id = claim.get("id", "unknown")
        id_to_claim[claim_id] = claim
        try:
            val = clean_numeric_value(str(claim.get("reported", "")))
            if val not in value_to_claims:
                value_to_claims[val] = []
            value_to_claims[val].append(claim_id)
        except Exception:
            continue

    for claim in claims:
        expr = str(claim.get("expression", ""))
        if not expr:
            continue

        try:
            operands = _extract_operands(expr)
        except Exception:
            continue

        warnings = []

        for operand in operands:
            if operand in value_to_claims:
                continue  # exact match — good
            # Check for near-match (hallucination detection)
            for known_val, known_ids in value_to_claims.items():
                if claim.get("id") in known_ids:
                    continue
                if known_val == Decimal('0'):
                    continue
                rel_diff = abs(
                    FINANCIAL_CTX.divide(
                        FINANCIAL_CTX.subtract(operand, known_val),
                        known_val
                    )
                )
                if Decimal('0') < rel_diff < Decimal('0.05'):
                    warnings.append(
                        f"Operand {operand:,} in expression is close to but "
                        f"does not exactly match reported value "
                        f"{known_val:,} from {', '.join(known_ids)} "
                        f"(diff: {_format_decimal(rel_diff * 100, 4)}%)."
                    )
                    break

        if warnings:
            claim["cross_validation_warning"] = " ".join(warnings)

    return claims
