import http.client
import urllib.parse
import json
import time

def test_upload():
    print("Testing /api/upload...")
    # Send a mock CSV upload
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="test.csv"\r\n'
        'Content-Type: text/csv\r\n\r\n'
        "Metric,Reported,Page\nRevenue,142500000,3\nGross Profit,62100000,3\n"
        f"\r\n--{boundary}--\r\n"
    ).encode('utf-8')
    
    headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Content-Length': str(len(body))
    }
    
    conn = http.client.HTTPConnection("127.0.0.1", 8000)
    conn.request("POST", "/api/upload", body, headers)
    response = conn.getresponse()
    data = response.read().decode('utf-8')
    conn.close()
    
    assert response.status == 200, f"Expected 200, got {response.status}"
    res_json = json.loads(data)
    assert res_json["filename"] == "test.csv"
    assert res_json["format"] == "csv"
    assert "Revenue" in res_json["text"]
    assert res_json["low_confidence"] is False
    print("[OK] /api/upload endpoint is working perfectly!")
    return res_json["text"]

def test_analyze():
    print("Testing /api/analyze SSE stream...")
    parsed_text = test_upload()
    # Payload
    payload = json.dumps({
        "text": parsed_text,
        "low_confidence": False
    }).encode('utf-8')
    
    headers = {
        'Content-Type': 'application/json',
        'Content-Length': str(len(payload))
    }
    
    conn = http.client.HTTPConnection("127.0.0.1", 8000)
    conn.request("POST", "/api/analyze", payload, headers)
    response = conn.getresponse()
    
    assert response.status == 200, f"Expected 200, got {response.status}"
    
    events_received = []
    
    # Read SSE chunks line by line
    buffer = ""
    while True:
        chunk = response.read(128).decode('utf-8', errors='ignore')
        if not chunk:
            break
        buffer += chunk
        while "\n\n" in buffer:
            event_block, buffer = buffer.split("\n\n", 1)
            lines = event_block.split("\n")
            event_type = None
            event_data = None
            for line in lines:
                if line.startswith("event:"):
                    event_type = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    event_data = line.split(":", 1)[1].strip()
            
            if event_type:
                events_received.append((event_type, event_data))
                print(f"  [SSE Event] {event_type} received")
                
    conn.close()
    
    # Verify we received all phases in correct order
    event_types = [e[0] for e in events_received]
    assert "parser" in event_types, "Missing 'parser' event"
    assert "auditor_chunk" in event_types, "Missing 'auditor_chunk' event"
    assert "auditor_done" in event_types, "Missing 'auditor_done' event"
    assert "verified_claims" in event_types, "Missing 'verified_claims' event"
    assert "forecaster_chunk" in event_types, "Missing 'forecaster_chunk' event"
    assert "done" in event_types, "Missing 'done' event"
    
    print("[OK] /api/analyze SSE stream sequence validated successfully!")

if __name__ == "__main__":
    time.sleep(1) # wait for server initialization
    test_analyze()
    print("All endpoint verification checks passed successfully!")

