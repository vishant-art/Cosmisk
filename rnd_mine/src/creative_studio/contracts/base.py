from __future__ import annotations
import secrets
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"

def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

class ContractBase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")
    schema_version: str = "2.0"
    object_type: str
    id: str
    created_at: str = Field(default_factory=utc_now)
    updated_at: str | None = None
    status: str = "active"
    source: str | None = None

    def to_doc(self) -> dict:
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)
