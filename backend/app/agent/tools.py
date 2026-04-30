from langchain.tools import tool
from db import get_db
from datetime import date, timedelta
import logging
from netra.decorators import task
from netra import Netra
import math
import uuid

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


def _compute_emi(principal: int, annual_rate_pct: float, tenure_months: int) -> float:
    r = annual_rate_pct / 12 / 100
    return principal * r * ((1 + r) ** tenure_months) / ((1 + r) ** tenure_months - 1)


@tool
def get_active_loans(customer_id: str):
    """
    Retrieve a verified customer's active loans with a summary of total outstanding and total monthly EMI.

    Parameters:
        customer_id (str): The customer id of the customer
    """

    try:
        db = get_db()
        [customer] = [c for c in db["customers"] if c["customer_id"] == customer_id]
        active_loans = customer["credit_report"]["active_loans"]

        total_outstanding = sum(loan["outstanding"] for loan in active_loans)
        total_monthly_emi = sum(loan["monthly_emi"] for loan in active_loans)

        return {
            "active_loans": active_loans,
            "total_outstanding": total_outstanding,
            "total_monthly_emi": total_monthly_emi
        }
    except IndexError:
        logging.error(f"get_active_loans - Customer not found: customer_id={customer_id}")
        return {"error": "Customer does not exist"}
    except Exception as e:
        logging.error(f"get_active_loans - Unexpected error: customer_id={customer_id}, error={e}")
        return {"error": "An error occurred"}


def _affordability_level(emi_to_income_pct: float) -> str:
    if emi_to_income_pct <= 30:
        return "comfortable"
    if emi_to_income_pct <= 40:
        return "stretching"
    return "unaffordable"


@tool
def suggest_tenure(customer_id: str, product_id: str, requested_amount: int):
    """
    Suggest the best loan tenure for a customer based on affordability. Computes EMI, total interest,
    total cost (including processing fee), and affordability level for every available tenure on the
    given product. Returns a ranked list (best option first) and a recommended tenure.

    Parameters:
        customer_id (str): The customer id of the customer
        product_id (str): The product id of the loan product
        requested_amount (int): The loan amount the customer wants
    """

    try:
        db = get_db()
        [customer] = [c for c in db["customers"] if c["customer_id"] == customer_id]
        [product] = [p for p in db["products"] if p["product_id"] == product_id]

        monthly_income = customer["financial_profile"]["monthly_income"]
        existing_emi = customer["financial_profile"]["existing_monthly_emi"]
        disposable = monthly_income - existing_emi
        processing_fee = requested_amount * product["processing_fee_pct"] / 100

        tenure_options = []

        for tenure in sorted(product["available_tenures_months"]):
            emi = _compute_emi(requested_amount, product["interest_rate_annual_pct"], tenure)
            total_interest = emi * tenure - requested_amount
            total_cost = requested_amount + total_interest + processing_fee
            emi_to_income_pct = round((emi / monthly_income) * 100, 2)
            level = _affordability_level(emi_to_income_pct)

            tenure_options.append({
                "tenure_months": tenure,
                "emi": round(emi, 2),
                "total_interest": round(total_interest, 2),
                "total_cost": round(total_cost, 2),
                "processing_fee": round(processing_fee, 2),
                "emi_to_income_pct": emi_to_income_pct,
                "affordability_level": level,
            })

        LEVEL_RANK = {"comfortable": 0, "stretching": 1, "unaffordable": 2}
        tenure_options.sort(key=lambda t: (LEVEL_RANK[t["affordability_level"]], t["total_cost"]))

        recommended = None
        for opt in tenure_options:
            if opt["affordability_level"] != "unaffordable":
                recommended = opt["tenure_months"]
                break

        return {
            "product_name": product["name"],
            "requested_amount": requested_amount,
            "monthly_income": monthly_income,
            "existing_emi": existing_emi,
            "disposable_income": disposable,
            "processing_fee": round(processing_fee, 2),
            "tenure_options": tenure_options,
            "recommended_tenure_months": recommended,
        }
    except IndexError:
        logging.error(f"suggest_tenure - Not found: customer_id={customer_id}, product_id={product_id}")
        return {"error": "Customer or product does not exist"}
    except Exception as e:
        logging.error(f"suggest_tenure - Unexpected error: customer_id={customer_id}, product_id={product_id}, error={e}")
        return {"error": "An error occurred"}


@tool
def get_improvement_suggestions(customer_id: str, rejection_reasons: list[str]):
    """
    Provide actionable improvement tips after a loan rejection. Analyzes the customer's profile
    against each rejection reason and returns specific steps they can take to become eligible.

    Parameters:
        customer_id (str): The customer id of the customer
        rejection_reasons (list[str]): The list of rejection reasons returned by check_eligibility
    """

    try:
        db = get_db()
        [customer] = [c for c in db["customers"] if c["customer_id"] == customer_id]

        credit = customer["credit_report"]
        financial = customer["financial_profile"]
        suggestions = []
        max_eligible_amount = None

        eligible_products = sorted(
            [p for p in db["products"] if p["min_credit_score"] <= credit["credit_score"]],
            key=lambda p: p["max_amount"],
        )
        if eligible_products:
            max_eligible_amount = eligible_products[-1]["max_amount"]

        for reason in rejection_reasons:
            reason_lower = reason.lower()

            if "debt-to-income" in reason_lower or "dti" in reason_lower:
                suggestions.append({
                    "issue": "High debt-to-income ratio",
                    "tips": [
                        f"Your existing monthly EMI is Rs.{financial['existing_monthly_emi']}. Paying off or reducing existing loans will improve your ratio.",
                        "Consider consolidating multiple debts into a single lower-EMI loan.",
                        f"Alternatively, request a lower loan amount to bring the ratio under 50%."
                    ]
                })

            if "credit score" in reason_lower:
                suggestions.append({
                    "issue": "Credit score below minimum threshold",
                    "tips": [
                        f"Your current credit utilization is {credit['credit_utilization_pct']}%. Aim to bring it below 30%.",
                        f"You have {credit['defaults_last_3_years']} default(s) in the last 3 years. Clearing outstanding defaults will significantly boost your score.",
                        "Ensure all future payments are made on time for at least 6 months before re-applying."
                    ]
                })

            if "maximum loanable amount" in reason_lower:
                product_names = ", ".join(p["name"] for p in eligible_products) if eligible_products else "none"
                tips = []
                if max_eligible_amount:
                    tips.append(f"The maximum loanable amount across your eligible products ({product_names}) is Rs.{max_eligible_amount}.")
                    tips.append(f"Consider applying for Rs.{max_eligible_amount} or less to proceed with your application.")
                else:
                    tips.append("You currently do not qualify for any loan products based on your credit score.")
                if credit["credit_score"] < 750:
                    tips.append(f"Improving your credit score (currently {credit['credit_score']}) above 750 may unlock products with higher limits.")
                suggestions.append({
                    "issue": "Requested amount exceeds maximum",
                    "tips": tips
                })

            if "tenure" in reason_lower:
                all_tenures = set()
                for p in eligible_products:
                    all_tenures.update(p["available_tenures_months"])
                sorted_tenures = sorted(all_tenures)
                suggestions.append({
                    "issue": "Requested tenure not available",
                    "tips": [
                        f"Available tenures for your eligible products are: {', '.join(str(t) + ' months' for t in sorted_tenures)}.",
                        "Try selecting one of the available tenure options."
                    ]
                })

        return {
            "suggestions": suggestions,
            "max_eligible_amount": max_eligible_amount
        }
    except IndexError:
        logging.error(f"get_improvement_suggestions - Customer not found: customer_id={customer_id}")
        return {"error": "Customer does not exist"}
    except Exception as e:
        logging.error(f"get_improvement_suggestions - Unexpected error: customer_id={customer_id}, error={e}")
        return {"error": "An error occurred"}


@tool
def calculate_prepayment(outstanding_amount: int, monthly_emi: int, annual_rate_pct: float, prepayment_amount: int, strategy: str):
    """
    Calculate the impact of a loan prepayment. Shows revised EMI or tenure and total interest saved.

    Parameters:
        outstanding_amount (int): Current outstanding loan principal
        monthly_emi (int): Current monthly EMI being paid
        annual_rate_pct (float): Annual interest rate as a percentage
        prepayment_amount (int): The lump-sum amount the customer wants to prepay
        strategy (str): Either "reduce_emi" (keep tenure, lower EMI) or "reduce_tenure" (keep EMI, shorter tenure)
    """

    try:
        if prepayment_amount >= outstanding_amount:
            return {
                "message": f"A prepayment of Rs.{prepayment_amount} covers the full outstanding of Rs.{outstanding_amount}. The loan can be closed entirely.",
                "interest_saved": 0,
                "new_outstanding": 0
            }

        r = annual_rate_pct / 12 / 100
        new_outstanding = outstanding_amount - prepayment_amount

        original_remaining = math.log(monthly_emi / (monthly_emi - r * outstanding_amount)) / math.log(1 + r)
        original_remaining = math.ceil(original_remaining)
        original_total_interest = monthly_emi * original_remaining - outstanding_amount

        if strategy == "reduce_tenure":
            new_remaining = math.log(monthly_emi / (monthly_emi - r * new_outstanding)) / math.log(1 + r)
            new_remaining = math.ceil(new_remaining)
            new_total_interest = monthly_emi * new_remaining - new_outstanding

            return {
                "strategy": "reduce_tenure",
                "new_outstanding": new_outstanding,
                "monthly_emi": monthly_emi,
                "original_remaining_months": original_remaining,
                "new_remaining_months": new_remaining,
                "months_saved": original_remaining - new_remaining,
                "interest_saved": round(original_total_interest - new_total_interest, 2)
            }
        else:
            new_emi = _compute_emi(new_outstanding, annual_rate_pct, original_remaining)
            new_total_interest = new_emi * original_remaining - new_outstanding

            return {
                "strategy": "reduce_emi",
                "new_outstanding": new_outstanding,
                "original_emi": monthly_emi,
                "new_emi": round(new_emi, 2),
                "emi_reduction": round(monthly_emi - new_emi, 2),
                "remaining_months": original_remaining,
                "interest_saved": round(original_total_interest - new_total_interest, 2)
            }
    except (ValueError, ZeroDivisionError) as e:
        logging.error(f"calculate_prepayment - Math error: outstanding={outstanding_amount}, emi={monthly_emi}, rate={annual_rate_pct}, prepay={prepayment_amount}, error={e}")
        return {"error": "Could not compute prepayment. Please verify the loan details."}
    except Exception as e:
        logging.error(f"calculate_prepayment - Unexpected error: error={e}")
        return {"error": "An error occurred"}


_DOCUMENT_CHECKLISTS = {
    "salaried": [
        {"name": "PAN Card", "description": "Original and photocopy"},
        {"name": "Aadhaar Card", "description": "Original and photocopy"},
        {"name": "Salary Slips", "description": "Last 3 months salary slips"},
        {"name": "Form 16", "description": "Latest Form 16 from employer"},
        {"name": "Bank Statements", "description": "Last 6 months bank statements"},
        {"name": "Employment Letter", "description": "Current employment confirmation letter"},
        {"name": "Passport-size Photos", "description": "2 recent passport-size photographs"},
        {"name": "Address Proof", "description": "Utility bill or rental agreement (not older than 3 months)"},
    ],
    "self_employed": [
        {"name": "PAN Card", "description": "Original and photocopy"},
        {"name": "Aadhaar Card", "description": "Original and photocopy"},
        {"name": "ITR Returns", "description": "Last 2 years Income Tax Returns"},
        {"name": "Business Registration", "description": "Certificate of business registration or incorporation"},
        {"name": "Bank Statements", "description": "Last 12 months bank statements (business and personal)"},
        {"name": "Profit & Loss Statement", "description": "Audited P&L for the last 2 financial years"},
        {"name": "Passport-size Photos", "description": "2 recent passport-size photographs"},
        {"name": "Address Proof", "description": "Utility bill or rental agreement (not older than 3 months)"},
    ],
    "business": [
        {"name": "PAN Card", "description": "Original and photocopy (personal and business)"},
        {"name": "Aadhaar Card", "description": "Original and photocopy"},
        {"name": "ITR Returns", "description": "Last 2 years Income Tax Returns"},
        {"name": "GST Returns", "description": "Last 12 months GST returns"},
        {"name": "Bank Statements", "description": "Last 12 months bank statements"},
        {"name": "Business Proof", "description": "GST certificate, trade licence, or Udyam registration"},
        {"name": "Audited Financials", "description": "Balance sheet and P&L for last 2 financial years"},
        {"name": "Passport-size Photos", "description": "2 recent passport-size photographs"},
        {"name": "Address Proof", "description": "Utility bill or rental agreement (not older than 3 months)"},
    ],
}


@tool
def get_document_checklist(employment_type: str, product_id: str):
    """
    Generate a personalized document checklist based on the customer's employment type and selected loan product.
    Should be called after a pre-approval is generated.

    Parameters:
        employment_type (str): Type of employment - "salaried", "self_employed", or "business"
        product_id (str): The product id of the selected loan product
    """

    try:
        db = get_db()
        [product] = [p for p in db["products"] if p["product_id"] == product_id]

        key = employment_type.lower().replace("-", "_").replace(" ", "_")
        documents = _DOCUMENT_CHECKLISTS.get(key, _DOCUMENT_CHECKLISTS["salaried"])

        return {
            "employment_type": employment_type,
            "product_name": product["name"],
            "documents": documents
        }
    except IndexError:
        logging.error(f"get_document_checklist - Product not found: product_id={product_id}")
        return {"error": "Product does not exist"}
    except Exception as e:
        logging.error(f"get_document_checklist - Unexpected error: employment_type={employment_type}, product_id={product_id}, error={e}")
        return {"error": "An error occurred"}


@tool
def find_nearest_branch(city: str):
    """
    Find Meridian Bank branches in a given city with available appointment slots.

    Parameters:
        city (str): The city to search for branches in
    """

    try:
        db = get_db()
        branches = [b for b in db.get("branches", []) if b["city"].lower() == city.lower()]

        if not branches:
            return {
                "branches": [],
                "message": f"No Meridian Bank branches found in {city}. Available cities: {', '.join(sorted(set(b['city'] for b in db.get('branches', []))))}"
            }

        return {
            "branches": [
                {
                    "branch_id": b["branch_id"],
                    "name": b["name"],
                    "address": b["address"],
                    "available_slots": b["available_slots"]
                }
                for b in branches
            ]
        }
    except Exception as e:
        logging.error(f"find_nearest_branch - Unexpected error: city={city}, error={e}")
        return {"error": "An error occurred"}


@tool
def schedule_appointment(customer_id: str, branch_id: str, preferred_date: str, time_slot: str):
    """
    Schedule a branch visit appointment for a customer. Returns a booking confirmation.

    Parameters:
        customer_id (str): The customer id of the customer
        branch_id (str): The branch id from find_nearest_branch results
        preferred_date (str): Preferred date in YYYY-MM-DD format
        time_slot (str): One of the available time slots from find_nearest_branch results
    """

    try:
        db = get_db()
        [customer] = [c for c in db["customers"] if c["customer_id"] == customer_id]
        [branch] = [b for b in db.get("branches", []) if b["branch_id"] == branch_id]

        if time_slot not in branch["available_slots"]:
            return {
                "error": f"Time slot '{time_slot}' is not available at this branch. Available slots: {', '.join(branch['available_slots'])}"
            }

        booking_id = f"BK-{date.today().year}-{uuid.uuid4().hex[:5].upper()}"

        return {
            "booking_id": booking_id,
            "customer_name": customer["full_name"],
            "branch_name": branch["name"],
            "branch_address": branch["address"],
            "date": preferred_date,
            "time_slot": time_slot,
            "status": "confirmed",
            "message": f"Your appointment at {branch['name']} on {preferred_date} at {time_slot} has been confirmed. Please carry all required documents."
        }
    except IndexError:
        logging.error(f"schedule_appointment - Not found: customer_id={customer_id}, branch_id={branch_id}")
        return {"error": "Customer or branch does not exist"}
    except Exception as e:
        logging.error(f"schedule_appointment - Unexpected error: customer_id={customer_id}, branch_id={branch_id}, error={e}")
        return {"error": "An error occurred"}