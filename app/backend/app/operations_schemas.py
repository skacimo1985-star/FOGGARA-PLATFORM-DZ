"""Validated inputs for auditable operational workflows."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, model_validator

Domain = Literal["water", "energy", "food", "ecosystem", "health"]
Sector = Literal["agriculture", "livestock", "aquaculture", "processing", "logistics", "equipment", "services"]
Unit = Literal["kg", "t", "l", "m3", "kWh", "unit", "hour"]
class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)

class Rule(Input):
    unit: str = Field(min_length=1, max_length=30)
    lower: float = Field(ge=-1e12, le=1e12)
    upper: float = Field(ge=-1e12, le=1e12)
    direction: Literal["higher", "lower"]
    weight: float = Field(gt=0, le=1)
    max_age_hours: int = Field(ge=1, le=8760)
    @model_validator(mode="after")
    def interval(self):
        if self.upper <= self.lower:
            raise ValueError("upper must exceed lower")
        return self

class PolicyIn(Input):
    name: str = Field(min_length=3, max_length=150)
    rules: dict[Domain, Rule]
    @model_validator(mode="after")
    def complete(self):
        if set(self.rules) != {"water", "energy", "food", "ecosystem", "health"}:
            raise ValueError("Exactly five WEFEH domains are required")
        if abs(sum(r.weight for r in self.rules.values()) - 1) > 1e-6:
            raise ValueError("Weights must sum to one")
        return self

class ObservationIn(Input):
    project_id: int = Field(gt=0)
    domain: Domain
    value: Decimal = Field(max_digits=18, decimal_places=5)
    unit: str = Field(min_length=1, max_length=30)
    source: str = Field(min_length=3, max_length=500)
    measured_at: AwareDatetime
    @model_validator(mode="after")
    def past(self):
        if self.measured_at > datetime.now(timezone.utc):
            raise ValueError("Future observations are not accepted")
        return self

class ReviewIn(Input):
    status: Literal["approved", "rejected"]
    note: str = Field(min_length=3, max_length=2000)

class ListingIn(Input):
    project_id: int | None = Field(default=None, gt=0)
    kind: Literal["offer", "demand"]
    sector: Sector
    title: str = Field(min_length=3, max_length=200)
    product_code: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{1,79}$")
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=4)
    unit: Unit
    wilaya: str = Field(min_length=2, max_length=80)

class LotIn(Input):
    project_id: int = Field(gt=0)
    code: str = Field(min_length=2, max_length=80)
    product: str = Field(min_length=2, max_length=150)
    sector: Sector
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=4)
    unit: Unit

class TransitionIn(Input):
    stage: Literal["processing", "quality_review", "ready", "dispatched", "closed"]
    note: str = Field(min_length=3, max_length=2000)

class ContactIn(Input):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    subject: str = Field(min_length=3, max_length=180)
    message: str = Field(min_length=10, max_length=5000)
    consent: Literal[True]
    website: str = Field(default="", max_length=0)

class PrivacyIn(Input):
    kind: Literal["access", "rectification", "erasure", "objection", "restriction"]
    note: str = Field(min_length=3, max_length=3000)

class ResolutionIn(Input):
    response: str = Field(min_length=10, max_length=3000)
