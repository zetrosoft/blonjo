import httpx
import base64
from app.core.config import settings
from sqlalchemy.orm import Session

class MCPClient:
    """
    Abstraksi koneksi ke MCP Server (mcp-backend-prod port :3000).
    MCP_ENABLED=false -> fallback ke AI engine lokal (zero breaking change).
    """
    
    @property
    def base_url(self) -> str:
        return settings.MCP_SERVER_URL.rstrip('/')

    async def call_tool(self, tool_name: str, arguments: dict) -> dict:
        """Generic MCP tool caller via HTTP POST JSON."""
        if not settings.MCP_ENABLED:
            raise RuntimeError("MCP_ENABLED=false, gunakan fallback AI lokal")
            
        headers = {}
        if settings.MCP_API_KEY:
            headers["Authorization"] = f"Bearer {settings.MCP_API_KEY}"
            
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/tools/{tool_name}",
                json=arguments,
                headers=headers
            )
            resp.raise_for_status()
            return resp.json()

    async def parse_transaction(self, db: Session, text: str, context: dict) -> dict:
        """
        Parse natural transaction text.
        Context dikirim ke MCP server agar AI mendapat pricing rules & COA yang relevan.
        Fallback ke local ai_engine jika MCP mati/disable.
        Return: dict { parsed_data, processor, token_in, token_out }
        """
        if settings.MCP_ENABLED:
            try:
                import json as _json
                from datetime import datetime as _dt

                # Format context menjadi string sections untuk MCP
                pricing_rules_str = ""
                rules = context.get("pricing_rules", [])
                if rules:
                    pricing_rules_str = "--- ATURAN HARGA JUAL (PRICING RULES) ---\n"
                    for r in rules:
                        pricing_rules_str += f"- {r.get('name','Aturan')}: {_json.dumps(r.get('rule_payload', r))}\n"

                mcp_context = {
                    "pricing_rules": pricing_rules_str or None,
                    "coa": context.get("coa") or None,
                    "today_date": _dt.now().strftime("%Y-%m-%d"),
                }
                # Hapus key None agar tidak dikirim
                mcp_context = {k: v for k, v in mcp_context.items() if v}

                res = await self.call_tool("parse_transaction", {
                    "text": text,
                    "context": mcp_context,
                })
                # Output MCP: { content: [{ type: "text", text: "..." }] }
                if "content" in res and len(res["content"]) > 0:
                    text_content = res["content"][0].get("text", "")
                    parsed = _json.loads(text_content)
                    return {
                        "parsed_data": parsed,
                        "processor": "mcp_server",
                        "token_in": 0,
                        "token_out": 0,
                    }
            except Exception as e:
                print(f"[MCPClient] parse_transaction gagal, fallback ke AI lokal. Error: {e}")

        # Fallback lokal — return full dict termasuk processor & token info
        from app.services.ai_engine import call_ai_text
        from app.services.smart_parser import build_minimal_prompt
        from datetime import datetime

        coa_str = context.get("coa", "")
        today_date = datetime.now().strftime("%Y-%m-%d")
        system_instruction, prompt = build_minimal_prompt(text, today_date, coa_str)

        res_ai = call_ai_text(db, prompt, system_instruction=system_instruction, temperature=0.0)
        return {
            "parsed_data": res_ai.get("parsed_data"),
            "processor": res_ai.get("processor", "local_fallback"),
            "token_in": res_ai.get("token_in", 0),
            "token_out": res_ai.get("token_out", 0),
        }

    async def parse_pricing_rule(self, db: Session, text: str) -> dict:
        """
        Parse pricing rule NLP.
        """
        if settings.MCP_ENABLED:
            try:
                res = await self.call_tool("parse_pricing_rule", {
                    "text": text
                })
                if "content" in res and len(res["content"]) > 0:
                    import json
                    text_content = res["content"][0].get("text", "")
                    return json.loads(text_content)
            except Exception as e:
                print(f"[MCPClient] parse_pricing_rule gagal, fallback ke AI lokal. Error: {e}")
                
        # Fallback lokal
        from app.services.ai_engine import parse_pricing_rule
        return parse_pricing_rule(db, text)

    async def ocr_receipt(self, db: Session, file_data: bytes, mime_type: str) -> dict:
        """
        OCR receipt image.
        """
        if settings.MCP_ENABLED:
            try:
                file_b64 = base64.b64encode(file_data).decode("utf-8")
                res = await self.call_tool("ocr_receipt", {
                    "file_b64": file_b64,
                    "mime_type": mime_type
                })
                if "content" in res and len(res["content"]) > 0:
                    import json
                    text_content = res["content"][0].get("text", "")
                    return json.loads(text_content)
            except Exception as e:
                print(f"[MCPClient] ocr_receipt gagal, fallback ke AI lokal. Error: {e}")
                
        # Fallback lokal
        from app.services.ai_engine import call_ai_vision
        res_vision = call_ai_vision(db, file_data, mime_type, prompt="Ekstrak data nota ini ke JSON")
        return res_vision

mcp_client = MCPClient()
