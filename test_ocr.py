import requests

url = "http://76.13.19.28:8005/api/v1/ocr/upload"
filepath = "/Users/user/Downloads/WhatsApp Image 2026-07-24 at 08.28.35.jpeg"

try:
    with open(filepath, 'rb') as f:
        # We need a dummy auth token, or we might get 401 Unauthorized
        headers = {}
        files = {'file': f}
        # But wait, without token we can't test it on the remote. 
        # Let me see if there's an easier way: local script that uses the gemini API directly?
