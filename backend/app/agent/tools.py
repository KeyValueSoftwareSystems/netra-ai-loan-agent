from langchain.tools import tool
from db import get_db
from datetime import date, timedelta
import logging
from netra.decorators import task
from netra import Netra
import math

@tool
# @task
def verify_identity(identifier_type: str, identifier_value: str):
    """
    Verify customer identity using PAN, Aadhaar, or phone number. Must be called before any other tool.

    Parameters:
        identifier_type (str): one of these values - "PAN", "AADHAAR", "PHONE"
        identifier_value (str): value of the identifier type
    """

    try:
        db = get_db()
        if identifier_type not in ["PAN", "AADHAAR", "PHONE"]:
            logging.error(f"Invalid identifier type: {identifier_type}, value: {identifier_value}")
            return {
                "error": "invalid identifier type"
            }

        [customer] = [customer for customer in db["customers"] if customer[identifier_type.lower()] == identifier_value]

        Netra.set_user_id(customer["customer_id"])

        return {
            "verified": customer["verified"],
            "customer_id": customer["customer_id"],
            "full_name": customer["full_name"],
            "kyc_status": customer["kyc_status"],
            "risk_flag": customer["risk_flag"]
        }
    except IndexError as e:
        logging.error(f"verify_identity - Customer not found: identifier_type={identifier_type}, identifier_value={identifier_value}, error={e}")
        return {
            "error": "Customer does not exist"
        }
    except Exception as e:
        logging.error(f"verify_identity - Unexpected error: identifier_type={identifier_type}, identifier_value={identifier_value}, error={e}")
        return {
            "error": "An error occurred"
        }

@tool
# @task
def fetch_credit_report(customer_id: str):
    """
    Fetch credit score and loan history for a verified customer.

    Parameters:
        customer_id (str): The customer id of the customer
    """

    try:
        db = get_db()
        [customer] = [customer for customer in db["customers"] if customer["customer_id"] == customer_id]
        return customer["credit_report"]
    except IndexError as e:
        logging.error(f"fetch_credit_report - Customer not found: customer_id={customer_id}, error={e}")
        return {
            "error": "Customer does not exist"
        }
    except Exception as e:
        logging.error(f"fetch_credit_report - Unexpected error: customer_id={customer_id}, error={e}")
        return {
            "error": "An error occurred"
        }
    
@tool
# @task
def fetch_financial_profile(customer_id: str):
    """
    Fetch income, employment, and banking details for a verified customer.

    Parameters:
        customer_id (str): The customer id of the customer
    """

    try:
        db = get_db()
        [customer] = [customer for customer in db["customers"] if customer["customer_id"] == customer_id]
        return customer["financial_profile"]
    except IndexError as e:
        logging.error(f"fetch_financial_profile - Customer not found: customer_id={customer_id}, error={e}")
        return {
            "error": "Customer does not exist"
        }
    except Exception as e:
        logging.error(f"fetch_financial_profile - Unexpected error: customer_id={customer_id}, error={e}")
        return {
            "error": "An error occurred"
        }
    
@tool
# @task
def search_loan_products(approved_amount: int, credit_score: int, employment_type: str):
    """
    Search available loan products matching the customer's profile and approved amount

    Parameters:
        approved_amount (int): The maximum loan amount approved for the customer
        credit_score (int): The customer's current credit score
        employment_type (str): Type of employment (e.g., "salaried", "self-employed", "business")
    """
    try:
        db = get_db()
        products = [product for product in db["products"] if product["min_credit_score"] <= credit_score]

        return {
            "loan_products": products
        }
    except Exception as e:
        logging.error(f"search_loan_products - Error: approved_amount={approved_amount}, credit_score={credit_score}, employment_type={employment_type}, error={e}")
        return {
            "error": "An error occurred"
        }
    
@tool
# @task
def check_eligibility(customer_id: str, credit_score: int, monthly_income: int, existing_monthly_emi: int, requested_amount: int, employment_type: str, loan_tenure_months: int):
    """
    Check loan eligibility based on credit and financial profile. Returns maximum approved amount and a decision on eligibility.

    Parameters:
        customer_id (str): The customer id of the customer
        credit_score (int): The customer's current credit score
        monthly_income (int): The customer's monthly income
        existing_monthly_emi (int): The customer's existing monthly EMI obligations
        requested_amount (int): The loan amount requested by the customer
        employment_type (str): Type of employment
        loan_tenure_months (int): Requested loan tenure in months
    """

    try:
        db = get_db()
        [customer] = [customer for customer in db["customers"] if customer["customer_id"] == customer_id]

        dti = customer["credit_report"]["defaults_last_3_years"] / monthly_income
        eligible_loan_products = sorted([product for product in db["products"] if product["min_credit_score"] <= credit_score], key=lambda product: product["max_amount"])
        eligible_loan_products_by_tenure = [product for product in db["products"] if loan_tenure_months in product["available_tenures_months"]]

        appr_requested_amount = math.ceil(requested_amount / 100000) * 100000

        eligibility_payload = {
            "eligible": True,
            "max_approved_amount": 0,
            "requested_amount": appr_requested_amount,
            "debt_to_income_ratio": dti,
            "rejection_reasons": [],
            "policy_version": "v3.2.1"
        }

        if dti > 0.5:
            eligibility_payload["eligible"] = False
            eligibility_payload["rejection_reasons"].append(f"Debt-to-income ratio of {dti} exceeds maximum of 0.50")
        
        if len(eligible_loan_products) == 0:
            eligibility_payload["eligible"] = False
            eligibility_payload["rejection_reasons"].append(f"Credit score {credit_score} is below minimum threshold of 600")
        else:
            eligibility_payload["max_approved_amount"] = min(appr_requested_amount, eligible_loan_products[-1]["max_amount"])

        if len(eligible_loan_products_by_tenure) == 0:
            eligibility_payload["eligible"] = False
            eligibility_payload["rejection_reasons"].append(f"Requested tenure of {loan_tenure_months} months is not available.")

        if len(eligible_loan_products) > 0 and eligible_loan_products[-1]["max_amount"] < requested_amount:
            eligibility_payload["eligible"] = False
            eligibility_payload["rejection_reasons"].append(f"Requested amount of Rs.{requested_amount} is more than the maximum loanable amount")

    
        return eligibility_payload
    except IndexError as e:
        logging.error(f"check_eligibility - Customer not found: customer_id={customer_id}, error={e}")
        return {
            "error": "Customer does not exist"
        }
    except Exception as e:
        logging.error(f"check_eligibility - Unexpected error: customer_id={customer_id}, credit_score={credit_score}, monthly_income={monthly_income}, requested_amount={requested_amount}, error={e}")
        return {
            "error": "An error occurred"
        }
    
@tool
# @task
def calculate_emi(principal: int, annual_rate_pct: float, tenure_months: int):
    """
    Calculate exact EMI for a given loan amount, interest rate, and tenure.

    Parameters:
        principal (int): The loan principal amount
        annual_rate_pct (int): The annual interest rate as a percentage
        tenure_months (int): The loan tenure in months
    """

    try:
        r = annual_rate_pct/12/100
        emi = principal * r * ((1+r)**tenure_months)/((1+r)**tenure_months - 1)

        return {
            "emi": emi
        }
    except Exception as e:
        logging.error(f"calculate_emi - Error: principal={principal}, annual_rate_pct={annual_rate_pct}, tenure_months={tenure_months}, error={e}")
        return {
            "error": "An error occurred"
        }
    
@tool
# @task
def generate_pre_approval(customer_id: str, product_id: str, amount: int, annual_rate_pct: float, tenure_months: int):
    """
    Generate a pre-approval reference for the selected loan product.

    Parameters:
        customer_id (str): The unique identifier of the customer requesting the pre-approval.
        product_id (str): The unique identifier of the loan product.
        amount (int): The loan amount requested in the base currency unit.
        annual_rate_pct (float): The annual interest rate as a percentage.
        tenure_months (int): The loan tenure or duration in months.
    """

    try:
        return {
            "pre_approval_id": "PA-2026-00142",
            "status": "pre_approved",
            "valid_until": date.today() + timedelta(days=7),
            "disclaimer": "This pre-approval is subject to final verification and does not guarantee loan disbursal. Please visit your nearest Meridian Bank branch with original documents to complete the application.",
            "next_steps": [
                "Visit nearest Meridian Bank branch with original PAN and Aadhaar",
                "Carry latest 3 months salary slips and bank statements",
                "Complete full application within 30 days of this pre-approval"
            ]
        }
    except Exception as e:
        logging.error(f"generate_pre_approval - Error: customer_id={customer_id}, product_id={product_id}, amount={amount}, annual_rate_pct={annual_rate_pct}, tenure_months={tenure_months}, error={e}")
        return {
            "error": "An error occurred"
        }
    
@tool
def parse_file(filename:str, mime_type:str, data:str):
    """
    IMPORTANT: DO NOT PASSS THIS TOOL TO AGENT YET.
    Parse the file contents. Not yet implemented.

    Parameters:
        filename (str): Name of the file
        mime_type (str): Mime type of the file
        data (int): Data inside the file. TODO: implement parsing images, documents etc.
    """
    return {
        "filename": filename,
        "mime_type": mime_type,
        "fileInformation": ""
    }