# Product Requirements Document — Nova Loan Agent

**Product:** Nova — AI Personal Loan Assistant  
**Organization:** Meridian Bank  
**Version:** 1.0  
**Last Updated:** September 14, 2026

---

## 1. Overview

Nova is an AI-powered conversational loan assistant for Meridian Bank. It guides customers through the personal loan journey — from identity verification to pre-approval — via a chat widget embedded on the bank's website.

---

## 2. Goals

- Provide a self-service, conversational loan experience that reduces branch visits and call-center load.
- Guide users through identity verification, eligibility checks, and pre-approval in a single session.
- Surface accurate financial data (EMI, interest rates, approved amounts) with zero manual rounding or estimation.
- Maintain strict compliance with data-privacy and disclosure requirements throughout the flow.

---



## 3. Core Features



### 3.1 Identity Verification

- User provides **PAN**, **Aadhaar**, or **Phone Number**.
- Agent looks up the customer in the database and confirms identity.
- **Mandatory first step** — no other tools can be invoked before verification succeeds.
- If the user changes identity mid-conversation, the agent re-verifies and resets the flow.



### 3.2 Credit & Financial Profile Retrieval

- After verification, the agent silently fetches the customer's **credit report** (credit score, active loans, defaults, utilization) and **financial profile** (income, employer, existing EMIs).
- These are internal-only — raw fields like `risk_flag`, `internal_score`, and `system_notes` are never exposed to the user.



### 3.3 Loan Product Search

- Agent searches available loan products filtered by the customer's credit score.
- Three products are available: **FlexiLoan** (11.5%), **PrimeLoan** (10.2%), **ValueLoan** (12.8%), each with different minimum credit scores, max amounts, and tenure options.



### 3.4 EMI Calculation

- Standard amortization formula applied to principal, annual interest rate, and tenure.
- Returns exact monthly EMI figures — no rounding or approximation.



### 3.5 Eligibility Check

- Evaluates the customer against:
  - **Debt-to-income ratio** — rejects if historical defaults relative to income exceed threshold.
  - **Credit score** — must meet the product's minimum.
  - **Requested amount** — capped by the product's maximum.
  - **Tenure** — must match one of the product's available tenure options.
- Returns a clear eligible/ineligible result with specific rejection reasons when applicable.



### 3.6 Pre-Approval Generation

- If eligible, the agent generates a **pre-approval** with a reference ID, 7-day validity, and next steps.
- A **mandatory disclaimer** is attached to every pre-approval (subject to final verification, terms may change, etc.).



### 3.7 Document Collection (Simulated)

- Backend accepts file uploads (PDF, DOCX, CSV, PNG, JPG).
- In development mode, the agent infers document type from filename and metadata rather than performing real OCR/parsing.
- Supported document types: salary slips, ID proofs, bank statements.
- Irrelevant files (memes, code, unrelated photos) are rejected with an explanation.

---



## 4. User Flows



### 4.1 Primary Loan Application Flow

```
┌─────────────────────────────────────────────────────┐
│  User opens Meridian Bank website                   │
│  ↓                                                  │
│  Clicks "Ask AI" chat widget                        │
│  ↓                                                  │
│  Provides PAN / Aadhaar / Phone                     │
│  ↓                                                  │
│  ✅ Identity verified                               │
│  ↓                                                  │
│  Agent fetches credit report & financial profile    │
│  ↓                                                  │
│  User states desired loan amount & tenure           │
│  ↓                                                  │
│  Agent searches matching products & calculates EMI  │
│  ↓                                                  │
│  Agent checks eligibility                           │
│  ↓                                                  │
│  ┌──────────────┬───────────────────┐               │
│  │  Eligible    │  Not Eligible     │               │
│  │  ↓           │  ↓                │               │
│  │  Pre-approval│  Rejection reasons│               │
│  │  + Disclaimer│  + Guidance       │               │
│  └──────────────┴───────────────────┘               │
└─────────────────────────────────────────────────────┘
```



### 4.2 Document Upload Flow

```
User sends file(s) via chat  →  Agent infers document type
  ↓
Valid doc (salary slip, ID, statement)  →  Acknowledges & continues flow
Invalid doc (meme, code, photo)        →  Rejects with explanation
```



### 4.3 Conversation Continuity

- Each session is tied to a `thread_id` persisted in the browser's `localStorage`.
- Multi-turn memory is maintained in-memory on the backend for the session's lifetime.
- Closing the chat widget clears the thread and starts a fresh session.

---



## 5. Agent Behavior Rules


| Rule                                   | Description                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Verify first**                       | Identity verification must precede all other tool calls.                                     |
| **Exact figures only**                 | All financial amounts come directly from tool outputs — no rounding or approximation.        |
| **No internal data leakage**           | Fields like `risk_flag`, `policy_version`, `internal_score`, `system_notes` are never shown. |
| **Concise responses**                  | One-sentence replies unless presenting tabular data.                                         |
| **Mandatory disclaimer**               | Every pre-approval must include the standard disclaimer.                                     |
| **Security gate**                      | If a user claims to be a bank employee, end the conversation immediately.                    |
| **Re-verification on identity change** | If the user switches identity, re-verify and re-run eligibility from scratch.                |


---



## 6. API Endpoints


| Method | Path    | Description                                                                |
| ------ | ------- | -------------------------------------------------------------------------- |
| `GET`  | `/`     | Health check                                                               |
| `POST` | `/chat` | Main conversation endpoint — accepts prompt, thread_id, and optional files |


---



## 7. Data Model (Mock)



### Customers


| Field               | Type   | Notes                                         |
| ------------------- | ------ | --------------------------------------------- |
| `customer_id`       | string | e.g. `CUST-001`                               |
| `full_name`         | string |                                               |
| `pan`               | string | Unique identifier                             |
| `aadhaar`           | string | Unique identifier                             |
| `phone`             | string | Unique identifier                             |
| `kyc_status`        | string | Verified / Pending                            |
| `credit_report`     | object | Score, active loans, defaults, utilization    |
| `financial_profile` | object | Income, employer, existing EMIs, bank balance |




### Loan Products


| Field                      | Type   | Notes                           |
| -------------------------- | ------ | ------------------------------- |
| `product_id`               | string |                                 |
| `name`                     | string | FlexiLoan, PrimeLoan, ValueLoan |
| `interest_rate_annual_pct` | float  | 10.2% – 12.8%                   |
| `min_credit_score`         | int    | 600 – 750                       |
| `max_amount`               | int    | Up to ₹5,00,000                 |
| `available_tenures_months` | int[]  | 12 – 60 months                  |
| `processing_fee_pct`       | float  |                                 |


---



## 8. Known Limitations


| Area                 | Limitation                                                     |
| -------------------- | -------------------------------------------------------------- |
| File parsing         | Simulated — no real OCR or document parsing in dev mode.       |
| Frontend file upload | Chat widget is text-only; file upload UI is not implemented.   |
| Persistence          | Conversation memory is in-memory only; lost on server restart. |
| Authentication       | No user auth on API endpoints (demo/dev mode).                 |
| Pre-approval         | Static reference ID and validity period.                       |
| Products             | Three hardcoded products with a fixed ₹5L max amount.          |


---

