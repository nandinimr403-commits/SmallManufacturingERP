# UdyogERP - Python Backend & SQLite Database Service

A lightweight, high-performance RESTful API microservice with persistent SQLite relational database storage and enterprise authentication designed for Indian MSME manufacturing plants.

---

## 🌟 Key Backend Capabilities

- **Relational SQLite Database Storage (`backend/data/udyog_erp.db`)**:
  - Full ACID transaction compliance with WAL mode for fast concurrency.
  - Tables: `users`, `sessions`, `company`, `suppliers`, `inventory`, `purchase_orders`, `grns`, `gst_invoices`, `audit_logs`.
  - Automatic seed initialization with authentic Indian manufacturing master data on first run.
- **Enterprise Authentication & Session Management**:
  - Cryptographically secure PBKDF2-HMAC-SHA256 password hashing with unique per-user salts.
  - Bearer session token management with 7-day expiration.
  - Endpoints: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout`.
  - 5 Pre-seeded enterprise roles: Admin, Plant Manager, Purchase Officer, Store Keeper, and Accountant.
- **GST Compliance Engine**:
  - Automated intra-state (CGST 50% + SGST 50%) vs inter-state (IGST 100%) calculations.
  - 15-character GSTIN regex verification and state code identification.
- **Inventory & Stock Reconciliation**:
  - Atomically increments physical warehouse inventory balances and updates linked Purchase Orders upon Goods Receipt Note (GRN) approval.
- **GSTR-2B & ITC Reconciliation**:
  - Calculates eligible vs ineligible Input Tax Credit (ITC) under Section 16 & 17(5) of the CGST Act.

---

## 🚀 How to Run the Backend Locally

### 1. Prerequisites
- Python 3.8 or later installed on your system.
- `pip` package manager.

### 2. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```
*(Dependencies: Flask, flask-cors. `sqlite3` and `hashlib` are built into Python's standard library).*

### 3. Start the API Server
```bash
python app.py
```
Output:
```text
======================================================================
🚀 UdyogERP Indian Manufacturing & GST ERP Backend Service
💾 Database Engine: SQLite 3 Persistent Storage (udyog_erp.db)
🔐 Authentication Engine: PBKDF2 Password Hashing & Bearer Sessions
🌐 Listening on: http://127.0.0.1:5000
======================================================================
```

### 4. Health Check
```bash
curl http://127.0.0.1:5000/api/health
```

### 5. Pre-Configured Demo Accounts
| Role | Username | Password | Full Name | Department |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Rajesh Sharma | Plant Management |
| **Plant Manager** | `manager` | `manager123` | Vikram Deshmukh | Production & Quality |
| **Purchase Officer** | `purchase` | `purchase123` | Amit Patel | Commercial Procurement |
| **Store Keeper** | `store` | `store123` | Sunil Jadhav | Raw Material Stores |
| **Accountant** | `accounts` | `accounts123` | Pooja Kulkarni | Finance & Taxation |
