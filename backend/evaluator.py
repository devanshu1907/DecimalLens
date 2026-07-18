import re
import ast
import operator
from decimal import Decimal

# Security limits for expression evaluation
_MAX_EXPR_LEN = 512   # chars — prevents DoS via huge strings
_MAX_AST_DEPTH = 50   # nodes — prevents deeply-nested bomb expressions

def clean_numeric_value(val_str: str) -> Decimal:
    """
    Cleans a string representing a number (e.g., "$142,500,000" or "24.50%")
    and returns a Decimal.
    """
    # Remove symbols like dollar, commas, spaces
    clean = val_str.replace('$', '').replace(',', '').strip()
    if clean.endswith('%'):
        # 24.50% -> 0.2450
        return Decimal(clean[:-1]) / Decimal('100')
    return Decimal(clean)

def safe_eval_expression(expr_str: str) -> Decimal:
    """
    Safely evaluates a basic arithmetic expression string containing numbers,
    +, -, *, /, using decimal.Decimal.

    Security hardening:
    - Length guard prevents DoS via enormous input strings.
    - Strict character whitelist (digits, whitespace, +-*/., parens) blocks
      any attempt to inject Python identifiers or calls before ast.parse.
    - AST depth counter prevents exponentially-nested bomb expressions.
    """
    # --- Length guard ---
    if len(expr_str) > _MAX_EXPR_LEN:
        raise ValueError(
            f"Expression is too long ({len(expr_str)} chars). Maximum is {_MAX_EXPR_LEN}."
        )

    # Remove dollar signs and commas
    clean_expr = expr_str.replace('$', '').replace(',', '').strip()
    
    # Preprocess percentages: convert "24.28%" -> "0.2428"
    def replace_percent(match):
        val = match.group(1)
        return str(Decimal(val) / Decimal('100'))
    
    clean_expr = re.sub(r'(\d+(?:\.\d+)?)%', replace_percent, clean_expr)

    # --- Strict character whitelist ---
    # Only allow digits, whitespace, the four arithmetic operators, parentheses,
    # and decimal points.  Any other character is rejected before ast.parse.
    if not re.fullmatch(r'[\d\s\+\-\*\/\.\(\)]+', clean_expr):
        raise ValueError(
            f"Expression contains disallowed characters: {clean_expr!r}"
        )
    
    # Supported operators mapping
    _operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.USub: operator.neg,
    }
    
    def eval_node(node, depth: int = 0) -> Decimal:
        # --- Depth guard ---
        if depth > _MAX_AST_DEPTH:
            raise ValueError(
                f"Expression is too deeply nested (max depth {_MAX_AST_DEPTH})."
            )
        if hasattr(ast, 'Num') and isinstance(node, ast.Num):  # Python < 3.8
            return Decimal(str(node.n))
        elif isinstance(node, ast.Constant):  # Python >= 3.8
            return Decimal(str(node.value))
        elif isinstance(node, ast.BinOp):
            left = eval_node(node.left, depth + 1)
            right = eval_node(node.right, depth + 1)
            op = type(node.op)
            if op in _operators:
                # Guard against division by zero explicitly
                if op is ast.Div and right == Decimal('0'):
                    raise ValueError("Division by zero in expression")
                return _operators[op](left, right)
            raise ValueError(f"Unsupported operator: {op}")
        elif isinstance(node, ast.UnaryOp):
            operand = eval_node(node.operand, depth + 1)
            op = type(node.op)
            if op in _operators:
                return _operators[op](operand)
            raise ValueError(f"Unsupported unary operator: {op}")
        else:
            raise ValueError(f"Unsupported syntax node type: {type(node).__name__}")
            
    tree = ast.parse(clean_expr, mode='eval')
    return eval_node(tree.body)

def verify_claim(reported_str: str, expression_str: str) -> dict:
    """
    Parses reported value and recomputes the math using Decimal.
    Compares the result and returns verified flag, recalculated string, and reason if failed.
    """
    try:
        reported_val = clean_numeric_value(reported_str)
    except Exception as e:
        return {
            "verified": False,
            "recalculated": "N/A",
            "reason": f"Failed to parse reported value '{reported_str}': {str(e)}"
        }
        
    try:
        recalculated_val = safe_eval_expression(expression_str)
    except Exception as e:
        return {
            "verified": False,
            "recalculated": "N/A",
            "reason": f"Failed to evaluate formula expression '{expression_str}': {str(e)}"
        }
        
    is_percent = '%' in reported_str
    
    # Extract decimal precision from the reported value string to match representation
    clean_reported_num_str = reported_str.replace('$', '').replace(',', '').replace('%', '').strip()
    if '.' in clean_reported_num_str:
        decimal_places = len(clean_reported_num_str.split('.')[1])
    else:
        decimal_places = 0
        
    # Fix: use proper decimal quantization step.
    # decimal_places=2 -> Decimal('0.01'), decimal_places=0 -> Decimal('1')
    if decimal_places > 0:
        quantize_step = Decimal('1e-' + str(decimal_places))
    else:
        quantize_step = Decimal('1')
    
    if is_percent:
        recalc_compare = (recalculated_val * 100).quantize(quantize_step)
        reported_compare = (reported_val * 100).quantize(quantize_step)
        recalc_str = f"{recalc_compare:.{decimal_places}f}%"
        verified = recalc_compare == reported_compare
    else:
        recalc_compare = recalculated_val.quantize(quantize_step)
        reported_compare = reported_val.quantize(quantize_step)
        
        # Format string representation
        if '$' in reported_str:
            recalc_str = f"${recalc_compare:,.{decimal_places}f}"
        else:
            recalc_str = f"{recalc_compare:,.{decimal_places}f}"
            
        verified = recalc_compare == reported_compare
        
    if verified:
        return {
            "verified": True,
            "recalculated": recalc_str,
            "reason": None
        }
    else:
        discrepancy = recalculated_val - reported_val
        if is_percent:
            discrepancy_str = f"{discrepancy * 100:+.{decimal_places or 2}f}%"
        elif '$' in reported_str:
            discrepancy_str = f"${discrepancy:+.{decimal_places or 2}f}"
        else:
            discrepancy_str = f"{discrepancy:+.{decimal_places or 2}f}"
            
        return {
            "verified": False,
            "recalculated": recalc_str,
            "reason": f"Arithmetic mismatch. Reported: {reported_str}. Recalculated: {recalc_str} (Discrepancy: {discrepancy_str})."
        }
