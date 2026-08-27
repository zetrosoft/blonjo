import requests
import json

url = "https://blonjo.samkarsa.com/api/v1/finance/transactions/parse"

payload = {
    "text": """
PT. INDOMARCO ADI PRIMA
Tgl: 24-07-2026
Jatuh Tempo: 14 Hari
Barang:
1. Indomie Goreng 1 Dus (40 Pcs) @ 110.000
2. Sarimi Isi 2 Ayam Bawang 1 Dus (24 Pcs) @ 85.000
"""
}

try:
    resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    print(resp.status_code)
    print(json.dumps(resp.json(), indent=2))
except Exception as e:
    print(e)
