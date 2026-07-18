import re
import ast
import operator
from decimal import Decimal

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
    """
    # Remove dollar signs and commas
    clean_expr = expr_str.replace('$', '').replace(',', '').strip()
    
    # Preprocess percentages: convert "24.28%" -> "0.2428"
    def replace_percent(match):
        val = match.group(1)
        return str(Decimal(val) / Decimal('100'))
    
    clean_expr = re.sub(r'(\d+(?:\.\d+)?)%', replace_percent, clean_expr)
    
    # Supported operators mapping
    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.USub: operator.neg,
    }
    
    def eval_node(node):
        if hasattr(ast, 'Num') and isinstance(node, ast.Num):  # Python < 3.8
            return Decimal(str(node.n))
        elif isinstance(node, ast.Constant):  # Python >= 3.8
            return Decimal(str(node.value))
        elif isinstance(node, ast.BinOp):
            left = eval_node(node.left)
            right = eval_node(node.right)
            op = type(node.op)
            if op in operators:
                return operators[op](left, right)
            raise ValueError(f"Unsupported operator: {op}")
        elif isinstance(node, ast.UnaryOp):
            operand = eval_node(node.operand)
            op = type(node.op)
            if op in operators:
                return operators[op](operand)
            raise ValueError(f"Unsupported unary operator: {op}")
        else:
            raise ValueError(f"Unsupported syntax: {type(node)}")
            
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
        
    # Set quantizing step
    quantize_step = Decimal('10.' + '0' * decimal_places) if decimal_places > 0 else Decimal('1.')
    
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
