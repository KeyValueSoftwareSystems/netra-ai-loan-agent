"""Agent tools for the Nova Loan Agent.

Each function is a plain typed Python function with a docstring.
Agno infers the tool schema from the function signature and docstring.
Netra @task decorators create a TASK span per tool invocation.
"""

import logging
import math
from datetime import date, timedelta

from netra import Netra, SpanType
from netra.decorators import task

from db import (
    get_customer_by_identifier,
    get_customer_by_id,
    get_credit_report as db_get_credit_report,
    get_financial_profile as db_get_financial_profile,
    search_products_by_score,
)


@task
def verify_identity(identifier_type: str, identifier_value: str) -> dict:
    """Verify customer identity using PAN, Aadhaar, or phone number. Must be called before any other tool.

    Args:
        identifier_type: One of "PAN", "AADHAAR", or "PHONE".
        identifier_value: The value of the identifier.
    """
    try:
        if identifier_type not in ("PAN", "AADHAAR", "PHONE"):
            logging.error(f"Invalid identifier type: {identifier_type}")
            return {"error": "invalid identifier type"}

        customer = get_customer_by_identifier(identifier_type, identifier_value)
        if customer is None:
            logging.error(f"verify_identity - Customer not found: {identifier_type}={identifier_value}")
            return {"error": "Customer does not exist"}

        Netra.set_user_id(customer["customer_id"])

        return {
            "verified": customer["verified"],
            "customer_id": customer["customer_id"],
            "full_name": customer["full_name"],
            "kyc_status": customer["kyc_status"],
            "risk_flag": customer["risk_flag"],
        }
    except Exception as e:
        logging.error(f"verify_identity - Unexpected error: {e}")
        return {"error": "An error occurred"}


@task
def fetch_credit_report(customer_id: str) -> dict:
    """Fetch credit score and loan history for a verified customer.

    Args:
        customer_id: The customer ID returned by verify_identity.
    """
    try:
        logging.info(f"fetch_credit_report - customer_id={customer_id}")
        report = db_get_credit_report(customer_id)
        if report is None:
            return {"error": "Customer does not exist"}
        return report
    except Exception as e:
        logging.error(f"fetch_credit_report - Unexpected error: {e}")
        return {"error": "An error occurred"}


@task
def fetch_financial_profile(customer_id: str) -> dict:
    """Fetch income, employment, and banking details for a verified customer.

    Args:
        customer_id: The customer ID returned by verify_identity.
    """
    try:
        logging.info(f"fetch_financial_profile - customer_id={customer_id}")
        profile = db_get_financial_profile(customer_id)
        if profile is None:
            return {"error": "Customer does not exist"}
        return profile
    except Exception as e:
        logging.error(f"fetch_financial_profile - Unexpected error: {e}")
        return {"error": "An error occurred"}


@task
def search_loan_products(approved_amount: int, credit_score: int, employment_type: str) -> dict:
    """Search available loan products matching the customer's credit score.

    Args:
        approved_amount: The maximum loan amount approved for the customer.
        credit_score: The customer's current credit score.
        employment_type: Type of employment (e.g. "salaried", "self_employed").
    """
    try:
        products = search_products_by_score(credit_score)
        return {"loan_products": products}
    except Exception as e:
        logging.error(f"search_loan_products - Error: {e}")
        return {"error": "An error occurred"}


@task
def check_eligibility(
    customer_id: str,
    credit_score: int,
    monthly_income: int,
    existing_monthly_emi: int,
    requested_amount: int,
    employment_type: str,
    loan_tenure_months: int,
) -> dict:
    """Check loan eligibility based on credit and financial profile. Returns eligibility decision with reasons.

    Args:
        customer_id: The customer ID.
        credit_score: The customer's current credit score.
        monthly_income: The customer's monthly income.
        existing_monthly_emi: The customer's existing monthly EMI obligations.
        requested_amount: The loan amount requested by the customer.
        employment_type: Type of employment.
        loan_tenure_months: Requested loan tenure in months.
    """
    with Netra.start_span(
        "Eligibility Decision (manually created span)",
        as_type=SpanType.SPAN,
        attributes={
            "customer_id": customer_id,
            "credit_score": str(credit_score),
            "requested_amount": str(requested_amount),
            "tenure_months": str(loan_tenure_months),
            "policy_version": "v3.2.1",
        },
    ) as decision_span:
        try:
            customer = get_customer_by_id(customer_id)
            if customer is None:
                decision_span.set_attribute("outcome", "customer_not_found")
                decision_span.set_error("Customer does not exist")
                return {"error": "Customer does not exist"}

            defaults = customer["defaults_last_3_years"]
            dti = defaults / monthly_income if monthly_income > 0 else 0

            eligible_products = sorted(
                search_products_by_score(credit_score),
                key=lambda p: p["max_amount"],
            )
            eligible_by_tenure = [
                p for p in eligible_products
                if loan_tenure_months in p["available_tenures_months"]
            ]

            appr_requested_amount = math.ceil(requested_amount / 100000) * 100000

            payload = {
                "eligible": True,
                "max_approved_amount": 0,
                "requested_amount": appr_requested_amount,
                "debt_to_income_ratio": dti,
                "rejection_reasons": [],
                "policy_version": "v3.2.1",
            }

            if dti > 0.5:
                payload["eligible"] = False
                payload["rejection_reasons"].append(
                    f"Debt-to-income ratio of {dti} exceeds maximum of 0.50"
                )

            if len(eligible_products) == 0:
                payload["eligible"] = False
                payload["rejection_reasons"].append(
                    f"Credit score {credit_score} is below minimum threshold of 600"
                )
            else:
                payload["max_approved_amount"] = min(
                    appr_requested_amount, eligible_products[-1]["max_amount"]
                )

            if len(eligible_by_tenure) == 0:
                payload["eligible"] = False
                payload["rejection_reasons"].append(
                    f"Requested tenure of {loan_tenure_months} months is not available."
                )

            if eligible_products and eligible_products[-1]["max_amount"] < requested_amount:
                payload["eligible"] = False
                payload["rejection_reasons"].append(
                    f"Requested amount of Rs.{requested_amount} is more than the maximum loanable amount"
                )

            decision_span.set_attribute("eligible", str(payload["eligible"]))
            decision_span.set_attribute("max_approved_amount", str(payload["max_approved_amount"]))
            decision_span.set_attribute("debt_to_income_ratio", str(round(dti, 4)))
            decision_span.set_attribute(
                "rejection_reasons",
                "; ".join(payload["rejection_reasons"]) or "none",
            )
            decision_span.set_attribute(
                "qualifying_products",
                ",".join(p["product_id"] for p in eligible_products) or "none",
            )
            if payload["eligible"]:
                decision_span.set_success()
            else:
                decision_span.set_attribute("outcome", "rejected")

            return payload
        except Exception as e:
            logging.error(f"check_eligibility - Unexpected error: {e}")
            decision_span.set_error(str(e))
            return {"error": "An error occurred"}


@task
def calculate_emi(principal: int, annual_rate_pct: float, tenure_months: int) -> dict:
    """Calculate exact EMI for a given loan amount, interest rate, and tenure using the standard amortization formula.

    Args:
        principal: The loan principal amount.
        annual_rate_pct: The annual interest rate as a percentage (e.g. 11.5).
        tenure_months: The loan tenure in months.
    """
    try:
        r = annual_rate_pct / 12 / 100
        emi = principal * r * ((1 + r) ** tenure_months) / ((1 + r) ** tenure_months - 1)
        return {"emi": emi}
    except Exception as e:
        logging.error(f"calculate_emi - Error: {e}")
        return {"error": "An error occurred"}


@task
def generate_pre_approval(
    customer_id: str,
    product_id: str,
    amount: int,
    annual_rate_pct: float,
    tenure_months: int,
) -> dict:
    """Generate a pre-approval reference for the selected loan product.

    Args:
        customer_id: The customer ID.
        product_id: The loan product ID (e.g. "FLEXI", "PRIME", "VALUE").
        amount: The loan amount in rupees.
        annual_rate_pct: The annual interest rate as a percentage.
        tenure_months: The loan tenure in months.
    """
    try:
        return {
            "pre_approval_id": "PA-2026-00142",
            "status": "pre_approved",
            "valid_until": str(date.today() + timedelta(days=7)),
            "disclaimer": (
                "This pre-approval is subject to final verification and does not "
                "guarantee loan disbursal. Please visit your nearest Meridian Bank "
                "branch with original documents to complete the application."
            ),
            "next_steps": [
                "Visit nearest Meridian Bank branch with original PAN and Aadhaar",
                "Carry latest 3 months salary slips and bank statements",
                "Complete full application within 30 days of this pre-approval",
            ],
        }
    except Exception as e:
        logging.error(f"generate_pre_approval - Error: {e}")
        return {"error": "An error occurred"}


AGENT_TOOLS = [
    verify_identity,
    fetch_credit_report,
    fetch_financial_profile,
    search_loan_products,
    check_eligibility,
    calculate_emi,
    generate_pre_approval,
]
