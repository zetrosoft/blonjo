import requests
from app.core.security import create_access_token
import sys

# Ambil token otentikasi
token = create_access_token(1)
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Teks retur yang ingin diuji
text = "Return Pembelian supplier SALES BUMBU :\n• Kunyit Bubuk 11 Rtg @4500"

print(f"Uji input text:\n{text}\n")

# Kirim request ke API local (port 8005)
data = {"text": text}

try:
    res = requests.post("http://76.13.19.28:8005/api/v1/finance/transactions/parse", headers=headers, json=data)
    print(f"Status: {res.status_code}")
    import json
    parsed = res.json()
    print(json.dumps(parsed, indent=2))
except Exception as e:
    print(f"Error: {e}")
