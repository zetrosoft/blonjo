import requests

url = "https://blonjo.samkarsa.com/api/v1/auth/login"
resp = requests.post(url, data={"username": "admin@blonjo.com", "password": "password"})
print(resp.json())
