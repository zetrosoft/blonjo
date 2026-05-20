from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    preferred_language: str

class TokenPayload(BaseModel):
    sub: str | None = None
