import requests
from app.core.security import create_access_token

token = create_access_token(1)
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
data = {"text": "Pendapatan Penjualan hari kemarin 1.700.000"}

try:
    res = requests.post("http://localhost:8005/api/v1/finance/transactions/parse", headers=headers, json=data)
    print(f"Status: {res.status_code}")
    print(res.text)
except Exception as e:
    print(f"Error: {e}")
