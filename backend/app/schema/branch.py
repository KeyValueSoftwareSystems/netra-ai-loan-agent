from typing import TypedDict


class Branch(TypedDict):
    branch_id: str
    name: str
    city: str
    address: str
    available_slots: list[str]
