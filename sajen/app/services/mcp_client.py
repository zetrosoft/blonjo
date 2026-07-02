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
        Fallback ke local ai_engine jika MCP mati/disable.
        """
        if settings.MCP_ENABLED:
            try:
                res = await self.call_tool("parse_transaction", {
                    "text": text,
                    "context": context
                })
                # Asumsi output tool berformat { content: [{ type: "text", text: "..." }] }
                if "content" in res and len(res["content"]) > 0:
                    import json
                    text_content = res["content"][0].get("text", "")
                    return json.loads(text_content)
            except Exception as e:
                print(f"[MCPClient] parse_transaction gagal, fallback ke AI lokal. Error: {e}")
                
        # Fallback lokal
        from app.services.ai_engine import call_ai_text
        # Buat prompt dummy minimal dari build_minimal_prompt
        from app.services.smart_parser import build_minimal_prompt
        from datetime import datetime
        
        coa_str = context.get("coa", "")
        today_date = datetime.now().strftime("%Y-%m-%d")
        system_instruction, prompt = build_minimal_prompt(text, today_date, coa_str)
        
        res_ai = call_ai_text(db, prompt, system_instruction=system_instruction, temperature=0.0)
        return res_ai.get("parsed_data")

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
