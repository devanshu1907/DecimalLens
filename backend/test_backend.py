from decimal import Decimal
from backend.evaluator import clean_numeric_value, safe_eval_expression, verify_claim
from backend.parser import check_malformed_text_tables, parse_csv

def test_clean_numeric_value():
    assert clean_numeric_value("$142,500,000") == Decimal("142500000")
    assert clean_numeric_value("24.50%") == Decimal("0.245")
    assert clean_numeric_value(" -12,000 ") == Decimal("-12000")
    print("[OK] test_clean_numeric_value passed")

def test_safe_eval_expression():
    assert safe_eval_expression("45200000 + 97300000") == Decimal("142500000")
    assert safe_eval_expression("142500000 - 80400000") == Decimal("62100000")
    assert safe_eval_expression("62100000 - 15400000 - 12100000") == Decimal("34600000")
    # Percentage evaluation
    assert safe_eval_expression("34600000 / 142500000").quantize(Decimal("0.0001")) == Decimal("0.2428")
    print("[OK] test_safe_eval_expression passed")

def test_verify_claim():
    # Test valid claim
    res_valid = verify_claim("$142,500,000", "45200000 + 97300000")
    assert res_valid["verified"] is True
    assert res_valid["recalculated"] == "$142,500,000"
    
    # Test mismatch claim (reported is $34,912,500 but formula yields 34,600,000)
    res_invalid = verify_claim("$34,912,500", "62100000 - 15400000 - 12100000")
    assert res_invalid["verified"] is False
    assert res_invalid["recalculated"] == "$34,600,000"
    assert "Arithmetic mismatch" in res_invalid["reason"]
    
    # Test percentage mismatch
    res_pct = verify_claim("24.50%", "34600000 / 142500000")
    assert res_pct["verified"] is False
    assert res_pct["recalculated"] == "24.28%"
    
    print("[OK] test_verify_claim passed")

def test_check_malformed_text_tables():
    # Normal table
    normal_text = """
    Revenue Table:
    Line Item    Q4 2025    Q4 2024
    Revenue      100        80
    COGS         60         50
    """
    assert check_malformed_text_tables(normal_text) is False
    
    # Malformed table (row 1 has 3 columns, row 2 has 4 columns, row 3 has 2 columns)
    malformed_text = """
    Financial Table:
    Item Name    US Segment    Intl Segment    Total
    Revenue      45            97              142
    Gross Profit 62            80
    Operating    34            15              12    11
    """
    assert check_malformed_text_tables(malformed_text) is True
    print("[OK] test_check_malformed_text_tables passed")

def test_parse_csv():
    csv_bytes = b"Metric,Reported,Page\nRevenue,142500000,3\nGross Profit,62100000,3"
    result = parse_csv(csv_bytes)
    assert result["low_confidence"] is False
    assert "| Metric | Reported | Page |" in result["text"]
    
    # Malformed csv (unequal columns)
    csv_malformed = b"Metric,Reported,Page\nRevenue,142500000\nGross Profit,62100000,3"
    result_malformed = parse_csv(csv_malformed)
    assert result_malformed["low_confidence"] is True
    print("[OK] test_parse_csv passed")

if __name__ == "__main__":
    print("Running backend tests...")
    test_clean_numeric_value()
    test_safe_eval_expression()
    test_verify_claim()
    test_check_malformed_text_tables()
    test_parse_csv()
    print("All backend tests passed successfully!")
