from typing import TypedDict
from schema.customer import Customer
from schema.product import Product
from schema.branch import Branch


class Database(TypedDict):
    products: list[Product]
    customers: list[Customer]
    branches: list[Branch]