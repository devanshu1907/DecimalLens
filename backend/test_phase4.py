import http.client
import json
import time

def test_verify_claim_endpoint():
    print("Testing /api/verify-claim...")
    # Test valid claim
    payload_valid = json.dumps({
        "reported": "$142,500,000",
        "expression": "45200000 + 97300000"
    }).encode('utf-8')
    
    headers = {
        'Content-Type': 'application/json',
        'Content-Length': str(len(payload_valid))
    }
    
    conn = http.client.HTTPConnection("127.0.0.1", 8000)
    conn.request("POST", "/api/verify-claim", payload_valid, headers)
    response = conn.getresponse()
    data = response.read().decode('utf-8')
    conn.close()
    
    assert response.status == 200, f"Expected 200, got {response.status}"
    res_json = json.loads(data)
    assert res_json["verified"] is True
    assert res_json["recalculated"] == "$142,500,000"
    print("[OK] /api/verify-claim valid math checked!")

    # Test invalid claim
    payload_invalid = json.dumps({
        "reported": "$34,912,500",
        "expression": "62100000 - 15400000 - 12100000"
    }).encode('utf-8')
    
    headers = {
        'Content-Type': 'application/json',
        'Content-Length': str(len(payload_invalid))
    }
    
    conn = http.client.HTTPConnection("127.0.0.1", 8000)
    conn.request("POST", "/api/verify-claim", payload_invalid, headers)
    response = conn.getresponse()
    data = response.read().decode('utf-8')
    conn.close()
    
    assert response.status == 200, f"Expected 200, got {response.status}"
    res_json = json.loads(data)
    assert res_json["verified"] is False
    assert res_json["recalculated"] == "$34,600,000"
    print("[OK] /api/verify-claim invalid math flagged!")

def test_forecast_endpoint():
    print("Testing /api/forecast...")
    payload = json.dumps({
        "claims": [
            {
                "id": "claim-1",
                "metric": "Revenue",
                "reported": "$142,500,000",
                "verified": True,
                "expression": "45200000 + 97300000"
            }
        ],
        "low_confidence_baseline": False
    }).encode('utf-8')
    
    headers = {
        'Content-Type': 'application/json',
        'Content-Length': str(len(payload))
    }
    
    conn = http.client.HTTPConnection("127.0.0.1", 8000)
    conn.request("POST", "/api/forecast", payload, headers)
    response = conn.getresponse()
    
    assert response.status == 200, f"Expected 200, got {response.status}"
    
    events_received = []
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
                
    conn.close()
    
    event_types = [e[0] for e in events_received]
    assert "status" in event_types, "Missing 'status' event"
    assert "forecaster_chunk" in event_types, "Missing 'forecaster_chunk' event"
    assert "done" in event_types, "Missing 'done' event"
    print("[OK] /api/forecast streaming events sequence validated successfully!")

if __name__ == "__main__":
    time.sleep(1.5) # wait for server to settle
    test_verify_claim_endpoint()
    test_forecast_endpoint()
    print("All Phase 4 backend endpoints verified successfully!")
