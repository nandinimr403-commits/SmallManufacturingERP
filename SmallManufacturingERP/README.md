# UdyogERP - Indian Small Manufacturing & GST ERP

A responsive, professional ERP web application built for small Indian manufacturers (MSMEs in engineering, fabrication, machining, and assembly) to manage **procurement, raw material inventory, Goods Receipt Notes (GRN), and statutory GST purchase records**.

---

## 🌟 Key Highlights & Features

- **Relational SQLite Database & Data Persistence**:
  - Production-grade relational schema with ACID compliance and WAL mode (`backend/data/udyog_erp.db`).
  - Tables for Users, Suppliers, Inventory, Purchase Orders, GRNs, GST Invoices, and Audit Logs.
  - Auto-seeding of realistic Indian MSME master data on initial startup.
  - Live Database Storage manager: inspect table counts, database size, export JSON backups, and reset database.
  - Dual-mode architecture: seamlessly connects to SQLite backend API with zero-latency reactive browser cache.

- **Enterprise Sign In & User Authentication**:
  - Secure password hashing using PBKDF2-HMAC-SHA256 with cryptographic salt and 7-day bearer session tokens.
  - User sign-in modal with tabbed account creation and 1-click quick login for 5 enterprise roles:
    - 👑 **Admin / Plant Head** (`admin` / `admin123`)
    - 🏭 **Plant Operations Manager** (`manager` / `manager123`)
    - 🛒 **Senior Purchase Officer** (`purchase` / `purchase123`)
    - 📦 **Stores & Inventory In-charge** (`store` / `store123`)
    - 📑 **GST & Tax Accountant** (`accounts` / `accounts123`)
  - Topbar user profile badge with initials avatar, role indicator, quick account switcher, and secure sign-out.
  - Automatic audit tracking: stamped with user names on POs, GRNs, and Invoices.

- **Executive Manufacturing Dashboard**:
  - Live stock valuation (₹) across active SKUs.
  - Critical low-stock & reorder alert badge counters.
  - Pending Purchase Orders (PO) and active material inward counts.
  - Month's Input Tax Credit (ITC) accumulated under CGST, SGST, and IGST.
  - Interactive visual tax split bars and quick action buttons.

- **Raw Material & Consumable Inventory**:
  - Pre-seeded with authentic Indian manufacturing materials (MS EN8D Bright Round Bars, SS304 Hex Rods, High Tensile Fasteners, Carbide Inserts, Cutting Coolants, Hydraulic Oils, Corrugated Packaging).
  - HSN code classifications (7214, 7222, 7318, 8209, 2710, etc.) and GST rate assignments (0%, 5%, 12%, 18%, 28%).
  - Real-time stock status badges: `In Stock`, `Low Stock`, `Out of Stock`.
  - Add, edit, filter by category or stock level, and search.

- **Approved Supplier Master & GSTIN Verification**:
  - Validates 15-character Indian GST numbers with statutory regex format (`27AAACT2727Q1ZW`).
  - Automatically identifies the 2-digit State Code (e.g. 27 for Maharashtra, 24 for Gujarat) and detects whether procurement from that vendor is **Intra-State (CGST + SGST)** or **Inter-State (IGST)**.

- **Dynamic Purchase Order (PO) Builder**:
  - Multi-line dynamic table where selecting items automatically pulls HSN, UOM, and price.
  - Live tax calculation engine: splits taxes into CGST (50%) + SGST (50%) for intra-state suppliers, or IGST (100%) for inter-state suppliers.
  - Generates official, printable Purchase Order vouchers with company letterhead, tax tables, and authorized signatory seals.

- **Goods Receipt Note (GRN / Inward Register)**:
  - Links to open Purchase Orders and pulls pending quantities.
  - Records delivery challan number, vehicle number, gate entry, accepted vs rejected quantities, rejection reasons, and batch/heat numbers.
  - **Automatic Stock Balance Sync**: Submitting the GRN instantly increments physical inventory stock and automatically resolves low-stock alerts.

- **GST Purchase Register & GSTR-2B Matching**:
  - Record supplier B2B tax invoices with CGST/SGST/IGST breakdown.
  - Track Input Tax Credit (ITC) eligibility (Eligible vs Ineligible under Section 17(5)).
  - Printable GST tax purchase vouchers for internal audit and voucher booking.

- **Purchase Reports & Analytics**:
  - Supplier-wise spend and turnover analysis.
  - HSN-wise GST tax summary required for GSTR-9 annual audits.
  - Low-stock audit report with deficit quantities and estimated replenishment costs.
  - **1-Click CSV Export**: Download audit-ready CSV spreadsheets for Microsoft Excel or Tally ERP integration.

---

## 📁 Project Architecture & Clean Separation

```
SmallManufacturingERP/
├── frontend/                     # Pure HTML5, CSS3 & JavaScript (No Node/build tool needed)
│   ├── index.html                # Master single-page application dashboard
│   ├── css/
│   │   ├── variables.css         # Color themes, manufacturing palette & spacing
│   │   ├── layout.css            # Sidebar shell, topbar & responsive grid
│   │   ├── components.css        # Cards, tables, forms, modals, user dropdown & DB stats
│   │   └── print.css             # High-quality printable vouchers for PO & GRN
│   └── js/
│       ├── sampleData.js         # Pre-loaded Indian manufacturing demo dataset
│       ├── storage.js            # SQLite database sync & local caching manager
│       ├── auth.js               # Sign in, registration, session & demo accounts
│       ├── gstUtils.js           # GST calculation engine (CGST, SGST, IGST, GSTIN regex)
│       ├── dashboard.js          # KPI metrics & quick action widgets
│       ├── inventory.js          # Inventory CRUD & stock status controller
│       ├── suppliers.js          # Supplier directory & state jurisdiction logic
│       ├── purchaseOrders.js     # Dynamic line items PO generator & print vouchers
│       ├── grn.js                # Goods receipt, QC checks & stock auto-increment
│       ├── gstInvoices.js        # GST Purchase Register & GSTR-2B reconciliation
│       ├── reports.js            # Purchase analytics & CSV export
│       └── app.js                # Router, modals, toast alerts & demo reset
│
├── backend/                      # Python Backend Service & Database
│   ├── data/
│   │   └── udyog_erp.db          # Persistent relational SQLite 3 database
│   ├── app.py                    # Flask REST API service with CORS & Auth endpoints
│   ├── database.py               # SQLite schema, migrations, hashing & transactions
│   ├── requirements.txt          # Python dependencies (Flask, flask-cors)
│   └── README.md                 # Backend & database setup guide
│
├── docs/
│   ├── API_DOCUMENTATION.md      # Comprehensive REST API specifications
│   └── USER_GUIDE.md             # Walkthrough of procurement & GST workflows
│
└── README.md                     # This file
```

---

## 🚀 How to Run the Website Locally

You can run the ERP website using any of the simple options below:

### Option 1: Direct Browser Launch (Easiest & Instant — Zero Installation)
1. Open File Explorer and navigate to the `frontend` folder:
   `C:\Users\manoj\OneDrive\ドキュメント\SmallManufacturingERP\frontend`
2. **Double-click `index.html`** (or right-click $\rightarrow$ **Open with** $\rightarrow$ **Microsoft Edge** or **Google Chrome**).
3. The ERP application will immediately load with full demo data, working calculations, dynamic forms, and printable documents stored locally in your browser!

---

### Option 2: Using Python HTTP Server
If Python is installed on your computer:
1. Open PowerShell or Command Prompt.
2. Navigate to the `frontend` directory:
   ```powershell
   cd "C:\Users\manoj\OneDrive\ドキュメント\SmallManufacturingERP\frontend"
   ```
3. Start Python's built-in web server:
   ```powershell
   python -m http.server 8000
   ```
4. Open your browser and go to:
   ```
   http://localhost:8000
   ```

---

### Option 3: Using VS Code Live Server
1. Open the `SmallManufacturingERP` folder in Visual Studio Code.
2. Install the **Live Server** extension (by Ritwick Dey) if not already installed.
3. Right-click on `frontend/index.html` and select **"Open with Live Server"**.

---

### Option 4: Running the Python Backend Service (Optional)
If you wish to test the Python REST API server:
1. Open PowerShell and navigate to the `backend` folder:
   ```powershell
   cd "C:\Users\manoj\OneDrive\ドキュメント\SmallManufacturingERP\backend"
   ```
2. Install the required packages:
   ```powershell
   pip install -r requirements.txt
   ```
3. Run the application:
   ```powershell
   python app.py
   ```
4. The API server will start on `http://127.0.0.1:5000`. You can test endpoints via `curl` or Postman as documented in [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md).

---

## 🔄 Resetting Demo Data
At any point, you can click the **Reset Demo** button on the top-right header of the ERP dashboard to restore the application back to its factory sample dataset.
