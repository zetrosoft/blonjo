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
            
        async with httpx.AsyncClient(timeout=150.0) as client:
            resp = await client.post(
                f"{self.base_url}/tools/{tool_name}",
                json=arguments,
                headers=headers
            )
            resp.raise_for_status()
            return resp.json()

    async def parse_transaction(self, db: Session, text: str, context: dict, tenant_id: int | None = None) -> dict:
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
                    "catalog_context": context.get("catalog_context") or None,
                    "today_date": _dt.now().strftime("%Y-%m-%d"),
                }
                # Hapus key None agar tidak dikirim
                mcp_context = {k: v for k, v in mcp_context.items() if v}

                payload = {
                    "text": text,
                    "context": mcp_context,
                }
                if tenant_id:
                    payload["tenant_id"] = str(tenant_id)

                res = await self.call_tool("parse_transaction", payload)
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
                print(f"[MCPClient] parse_transaction gagal, fallback ke AI lokal. Error: {repr(e)}")


        # Fallback lokal — return full dict termasuk processor & token info
        from app.services.ai_engine import call_ai_text
        from app.services.smart_parser import build_minimal_prompt
        from datetime import datetime

        coa_str = context.get("coa", "")
        catalog_str = context.get("catalog_context", "")
        today_date = datetime.now().strftime("%Y-%m-%d")
        system_instruction, prompt = build_minimal_prompt(text, today_date, coa_str, catalog_str)

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

    async def ocr_receipt(self, db: Session, file_data: bytes, mime_type: str, tenant_id: int = None) -> dict:
        """
        OCR receipt image.
        """
        if settings.MCP_ENABLED:
            try:
                # Tarik konteks UOM dari database
                uom_context = ""
                if tenant_id:
                    from app.models.inventory import Uom
                    uoms = db.query(Uom).all()
                    if uoms:
                        uom_list = [f"{u.code} ({u.name})" for u in uoms]
                        uom_context = ", ".join(uom_list)

                file_b64 = base64.b64encode(file_data).decode("utf-8")
                context_payload: dict = {}
                if uom_context:
                    context_payload["uom_context"] = uom_context
                if tenant_id:
                    context_payload["tenant_id"] = str(tenant_id)
                res = await self.call_tool("ocr_receipt", {
                    "file_b64": file_b64,
                    "mime_type": mime_type,
                    "context": context_payload
                })
                if "content" in res and len(res["content"]) > 0:
                    import json
                    text_content = res["content"][0].get("text", "")
                    return json.loads(text_content)
            except Exception as e:
                print(f"[MCPClient] ocr_receipt gagal, fallback ke AI lokal. Error: {repr(e)}")
                
        # Fallback lokal
        from app.services.ai_engine import call_ai_vision
        res_vision = call_ai_vision(db, file_data, mime_type, prompt="Ekstrak data nota ini ke JSON")
        return res_vision

    # --- DEPRECATED: VISUAL TEMPLATE MATCHING & LEARNING ---
    # Dinonaktifkan (dikomen) karena pemrosesan OCR kini 100% menggunakan RAG Vector Store & AI Vision utuh di mcp ocr_receipt.
    # async def match_visual_template(self, image_hash: str) -> dict:
    #     if settings.MCP_ENABLED:
    #         try:
    #             res = await self.call_tool("match_visual_template", {
    #                 "image_hash": image_hash
    #             })
    #             if "content" in res and len(res["content"]) > 0:
    #                 import json
    #                 text_content = res["content"][0].get("text", "")
    #                 return json.loads(text_content)
    #         except Exception as e:
    #             print(f"[MCPClient] match_visual_template gagal. Error: {repr(e)}")
    #     return {"matched": False}

    # async def learn_visual_template(self, image_hash: str, merchant_name: str, bounding_boxes: dict, static_headers: dict) -> dict:
    #     if settings.MCP_ENABLED:
    #         try:
    #             res = await self.call_tool("learn_visual_template", {
    #                 "image_hash": image_hash,
    #                 "merchant_name": merchant_name,
    #                 "bounding_boxes": bounding_boxes,
    #                 "static_headers": static_headers
    #             })
    #             if "content" in res and len(res["content"]) > 0:
    #                 import json
    #                 text_content = res["content"][0].get("text", "")
    #                 return json.loads(text_content)
    #         except Exception as e:
    #             print(f"[MCPClient] learn_visual_template gagal. Error: {repr(e)}")
    # ----------------------------------------------------
    def search_item_alias_sync(self, query: str, tenant_id: int | None = None) -> dict:
        import httpx
        if not settings.MCP_ENABLED:
            return {"success": False}
        
        headers = {}
        if settings.MCP_API_KEY:
            headers["Authorization"] = f"Bearer {settings.MCP_API_KEY}"
            
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    f"{self.base_url}/api/v1/rag/search-item",
                    json={"query": query, "tenant_id": tenant_id},
                    headers=headers
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            print(f"[MCPClient] search_item_alias_sync gagal. Error: {repr(e)}")
            return {"success": False}

    def ingest_item_alias_sync(self, raw_name: str, resolved_name: str, tenant_id: int | None = None) -> dict:
        import httpx
        if not settings.MCP_ENABLED:
            return {"success": False}
        
        headers = {}
        if settings.MCP_API_KEY:
            headers["Authorization"] = f"Bearer {settings.MCP_API_KEY}"
            
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    f"{self.base_url}/api/v1/rag/ingest-item",
                    json={"raw_name": raw_name, "resolved_name": resolved_name, "tenant_id": tenant_id},
                    headers=headers
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            print(f"[MCPClient] ingest_item_alias_sync gagal. Error: {repr(e)}")
            return {"success": False}

mcp_client = MCPClient()
