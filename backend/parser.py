import io
import csv
import re
from pypdf import PdfReader

def check_malformed_text_tables(text: str) -> bool:
    """
    Analyzes lines of text to check for misaligned tabular columns or malformed table blocks.
    A table block is a sequence of lines containing multiple columns (whitespace-separated values).
    If columns counts vary within a consecutive block, we flag it as low_confidence.
    """
    lines = text.split('\n')
    table_block = []
    
    for line in lines:
        line = line.strip()
        if not line:
            if len(table_block) > 2:
                # Finished a table block, check for consistency
                if len(set(table_block)) > 1:
                    return True
                table_block = []
            continue
            
        # Split by multiple spaces (e.g. 2 or more spaces) to identify column gaps
        parts = [p.strip() for p in re.split(r'\s{2,}', line) if p.strip()]
        
        # Count parts containing digits (values, dates, or percentages)
        num_values = sum(1 for p in parts if any(c.isdigit() for c in p))
        
        # If there are at least two values, consider it a potential table row
        if len(parts) >= 2 and num_values >= 1:
            table_block.append(len(parts))
        else:
            if len(table_block) > 2:
                if len(set(table_block)) > 1:
                    return True
                table_block = []
                
    if len(table_block) > 2 and len(set(table_block)) > 1:
        return True
        
    return False

def parse_pdf(file_bytes: bytes) -> dict:
    """
    Parses a PDF using layout-aware mode.
    Returns extracted text and low_confidence flag.
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    text_content = []
    low_confidence = False
    
    for page_num, page in enumerate(reader.pages):
        # Extract text trying to preserve layout structure
        try:
            page_text = page.extract_text(extraction_mode="layout")
        except Exception:
            page_text = page.extract_text()
            
        text_content.append(f"--- PAGE {page_num + 1} ---\n{page_text}")
        
        if check_malformed_text_tables(page_text):
            low_confidence = True
            
    full_text = "\n\n".join(text_content)
    return {
        "text": full_text,
        "low_confidence": low_confidence,
        "format": "pdf"
    }

def parse_csv(file_bytes: bytes) -> dict:
    """
    Parses a CSV file, formatting it as a clean Markdown table.
    If rows have mismatched column counts, sets low_confidence = True.
    """
    content = file_bytes.decode('utf-8', errors='ignore')
    reader = csv.reader(io.StringIO(content))
    rows = [r for r in reader if r]
    
    if not rows:
        return {"text": "", "low_confidence": False, "format": "csv"}
        
    col_counts = [len(row) for row in rows]
    low_confidence = len(set(col_counts)) > 1
    
    # Format as markdown table
    md_table = []
    headers = rows[0]
    md_table.append("| " + " | ".join(headers) + " |")
    md_table.append("| " + " | ".join(["---"] * len(headers)) + " |")
    
    max_cols = len(headers)
    for row in rows[1:]:
        if len(row) < max_cols:
            row = row + [""] * (max_cols - len(row))
        else:
            row = row[:max_cols]
        md_table.append("| " + " | ".join(row) + " |")
        
    return {
        "text": "\n".join(md_table),
        "low_confidence": low_confidence,
        "format": "csv"
    }

def parse_markdown(file_bytes: bytes) -> dict:
    """
    Parses a Markdown file. Checks for malformed text tables.
    """
    text = file_bytes.decode('utf-8', errors='ignore')
    low_confidence = check_malformed_text_tables(text)
    
    return {
        "text": text,
        "low_confidence": low_confidence,
        "format": "md"
    }

def parse_document(filename: str, file_bytes: bytes) -> dict:
    """
    Determines document type by extension and parses it.
    """
    ext = filename.split('.')[-1].lower()
    if ext == 'pdf':
        return parse_pdf(file_bytes)
    elif ext == 'csv':
        return parse_csv(file_bytes)
    elif ext in ['md', 'markdown', 'txt']:
        return parse_markdown(file_bytes)
    else:
        # Fallback to plain text decoding
        text = file_bytes.decode('utf-8', errors='ignore')
        return {
            "text": text,
            "low_confidence": check_malformed_text_tables(text),
            "format": ext
        }
