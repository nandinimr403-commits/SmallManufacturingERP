"""
UdyogERP - Database Persistence Layer (SQLite)
Provides relational database schema, connection pooling, seed initialization,
user authentication hashing, and atomic transactions.
"""

import os
import sqlite3
import json
import hashlib
import secrets
from datetime import datetime, timedelta

# Database path inside backend/data/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "udyog_erp.db")

def ensure_data_dir():
    """Ensure data directory exists."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)

def get_connection():
    """Returns a SQLite connection with Row factory and WAL mode for concurrency."""
    ensure_data_dir()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

# ============================================================================
# PASSWORD HASHING & AUTH UTILITIES
# ============================================================================

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Hashes a password with PBKDF2-HMAC-SHA256 and a cryptographically secure salt."""
    if not salt:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pwd_hash, salt

def verify_password(stored_hash: str, salt: str, password: str) -> bool:
    """Verifies a plain-text password against the stored hash and salt."""
    new_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(stored_hash, new_hash)

# ============================================================================
# SCHEMA INITIALIZATION
# ============================================================================

def init_db(force_reseed=False):
    """Initializes tables and seeds initial data if database is empty."""
    ensure_data_dir()
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        department TEXT,
        avatar_text TEXT,
        created_at TEXT NOT NULL,
        last_login TEXT
    );
    """)

    # 2. Auth Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 3. Company Profile Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS company (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        trade_name TEXT,
        gstin TEXT NOT NULL,
        state_code TEXT NOT NULL,
        state_name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        msme_reg_no TEXT,
        pan TEXT,
        cin TEXT,
        bank_details TEXT,
        updated_at TEXT
    );
    """)

    # 4. Suppliers Master
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_name TEXT,
        gstin TEXT NOT NULL,
        state_code TEXT NOT NULL,
        state_name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        payment_terms TEXT,
        rating REAL DEFAULT 4.5,
        created_at TEXT
    );
    """)

    # 5. Raw Materials & Inventory Master
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        hsn TEXT NOT NULL,
        uom TEXT NOT NULL,
        current_stock REAL NOT NULL DEFAULT 0,
        reorder_level REAL NOT NULL DEFAULT 0,
        safety_stock REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 18,
        preferred_supplier_id TEXT,
        location TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (preferred_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    );
    """)

    # 6. Purchase Orders
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        po_number TEXT NOT NULL,
        po_date TEXT NOT NULL,
        expected_delivery_date TEXT,
        supplier_id TEXT NOT NULL,
        supplier_name TEXT,
        supplier_gstin TEXT,
        supplier_state_code TEXT,
        status TEXT NOT NULL DEFAULT 'Issued',
        subtotal REAL NOT NULL DEFAULT 0,
        cgst_total REAL NOT NULL DEFAULT 0,
        sgst_total REAL NOT NULL DEFAULT 0,
        igst_total REAL NOT NULL DEFAULT 0,
        round_off REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        notes TEXT,
        payment_terms TEXT,
        items TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    """)

    # 7. Goods Receipt Notes (GRN)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS grns (
        id TEXT PRIMARY KEY,
        grn_number TEXT NOT NULL,
        grn_date TEXT NOT NULL,
        po_id TEXT NOT NULL,
        po_number TEXT,
        supplier_id TEXT,
        supplier_name TEXT,
        challan_number TEXT,
        challan_date TEXT,
        vehicle_number TEXT,
        gate_entry_number TEXT,
        remarks TEXT,
        status TEXT NOT NULL DEFAULT 'Approved',
        received_by TEXT,
        items TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
    );
    """)

    # 8. GST Invoices (Purchase Register)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gst_invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        supplier_name TEXT,
        supplier_gstin TEXT,
        supplier_state_code TEXT,
        po_number TEXT,
        grn_number TEXT,
        taxable_amount REAL NOT NULL DEFAULT 0,
        tax_type TEXT NOT NULL,
        cgst_rate REAL NOT NULL DEFAULT 0,
        cgst_amount REAL NOT NULL DEFAULT 0,
        sgst_rate REAL NOT NULL DEFAULT 0,
        sgst_amount REAL NOT NULL DEFAULT 0,
        igst_rate REAL NOT NULL DEFAULT 0,
        igst_amount REAL NOT NULL DEFAULT 0,
        round_off REAL NOT NULL DEFAULT 0,
        total_invoice_amount REAL NOT NULL DEFAULT 0,
        itc_eligibility TEXT NOT NULL DEFAULT 'Eligible',
        itc_claimed INTEGER NOT NULL DEFAULT 1,
        gstr2b_status TEXT NOT NULL DEFAULT 'Matched',
        payment_status TEXT NOT NULL DEFAULT 'Pending',
        due_date TEXT,
        hsn_summary TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    """)

    # 9. Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        timestamp TEXT NOT NULL
    );
    """)

    conn.commit()

    # Seed data if users table is empty or force_reseed is True
    cursor.execute("SELECT COUNT(*) FROM users;")
    user_count = cursor.fetchone()[0]

    if user_count == 0 or force_reseed:
        seed_default_data(conn)

    conn.close()

# ============================================================================
# SEED INITIAL DATA (Realistic Indian Manufacturing Dataset)
# ============================================================================

def seed_default_data(conn):
    """Seeds default users, company profile, suppliers, inventory, POs, GRNs, and Invoices."""
    cursor = conn.cursor()

    # Clear existing data if force reseeding
    cursor.execute("DELETE FROM sessions;")
    cursor.execute("DELETE FROM audit_logs;")
    cursor.execute("DELETE FROM gst_invoices;")
    cursor.execute("DELETE FROM grns;")
    cursor.execute("DELETE FROM purchase_orders;")
    cursor.execute("DELETE FROM inventory;")
    cursor.execute("DELETE FROM suppliers;")
    cursor.execute("DELETE FROM company;")
    cursor.execute("DELETE FROM users;")

    now_iso = datetime.now().isoformat()

    # 1. Seed Users (5 Enterprise Roles)
    default_users = [
        {
            "id": "USR-001",
            "username": "admin",
            "password": "admin123",
            "full_name": "Rajesh Sharma",
            "email": "rajesh.sharma@shreeprecision.com",
            "role": "Admin",
            "department": "Plant Management",
            "avatar_text": "RS"
        },
        {
            "id": "USR-002",
            "username": "manager",
            "password": "manager123",
            "full_name": "Vikram Deshmukh",
            "email": "vikram.d@shreeprecision.com",
            "role": "Plant Manager",
            "department": "Production & Quality",
            "avatar_text": "VD"
        },
        {
            "id": "USR-003",
            "username": "purchase",
            "password": "purchase123",
            "full_name": "Amit Patel",
            "email": "amit.patel@shreeprecision.com",
            "role": "Purchase Officer",
            "department": "Commercial Procurement",
            "avatar_text": "AP"
        },
        {
            "id": "USR-004",
            "username": "store",
            "password": "store123",
            "full_name": "Sunil Jadhav",
            "email": "sunil.j@shreeprecision.com",
            "role": "Store Keeper",
            "department": "Raw Material Stores",
            "avatar_text": "SJ"
        },
        {
            "id": "USR-005",
            "username": "accounts",
            "password": "accounts123",
            "full_name": "Pooja Kulkarni",
            "email": "pooja.k@shreeprecision.com",
            "role": "Accountant",
            "department": "Finance & Taxation",
            "avatar_text": "PK"
        }
    ]

    for u in default_users:
        pwd_hash, salt = hash_password(u["password"])
        cursor.execute("""
            INSERT INTO users (id, username, password_hash, salt, full_name, email, role, department, avatar_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (u["id"], u["username"], pwd_hash, salt, u["full_name"], u["email"], u["role"], u["department"], u["avatar_text"], now_iso))

    # 2. Seed Company Profile
    bank_info = {
        "bankName": "State Bank of India",
        "branch": "Chakan Industrial Branch, Pune",
        "accountNo": "3892010045892",
        "ifsc": "SBIN0011244"
    }
    cursor.execute("""
        INSERT INTO company (id, name, trade_name, gstin, state_code, state_name, address, phone, email, msme_reg_no, pan, cin, bank_details, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "Shree Precision Industries Pvt. Ltd.",
        "Shree Precision Engineering & Fabrication Works",
        "27AABCS1429B1ZB",
        "27",
        "Maharashtra",
        "Plot No. E-42, Chakan Industrial Area, Phase-II, MIDC, Pune - 410501, Maharashtra, India",
        "+91 2135 667800 / +91 98220 12345",
        "procurement@shreeprecision.com",
        "UDYAM-MH-26-0049182",
        "AABCS1429B",
        "U28112PN2015PTC154321",
        json.dumps(bank_info),
        now_iso
    ))

    # 3. Seed Suppliers
    suppliers = [
        ("SUP-001", "Tata Steel Tubes & Rods Depot", "Tata Steel Limited - Stockyard Depot", "27AAACT2727Q1ZW", "27", "Maharashtra", "Rajesh Shinde (Branch Sales)", "9822144556", "pune.depot@tatasteel.com", "Gat No. 124, Nagar Road, Wagholi, Pune - 412207", "Net 30 Days", 4.8, now_iso),
        ("SUP-002", "Jindal Stainless Alloys Ltd.", "Jindal Stainless Stockyard", "24AABCS9821L1ZM", "24", "Gujarat", "Ketan Patel (Commercial Mgr)", "9426088219", "sales.baroda@jindalstainless.com", "Plot 88, GIDC Industrial Estate, Makarpura, Vadodara - 390010, Gujarat", "Net 45 Days", 4.6, now_iso),
        ("SUP-003", "Unbrako Fasteners India", "Deepak Fasteners Ltd. (Unbrako)", "06AACCL8432M1ZP", "06", "Haryana", "Amit Verma", "9811233445", "delhi.sales@unbrako.in", "Sector 18, Industrial Development Area, Gurugram - 122015, Haryana", "Net 15 Days", 4.9, now_iso),
        ("SUP-004", "Sandvik Coromant Cutting Tools", "Sandvik Coromant India Pvt. Ltd.", "27AAACS4412R1Z3", "27", "Maharashtra", "Sanjay Kulkarni (Tech Rep)", "9823067890", "sanjay.kulkarni@sandvik.com", "Mumbai-Pune Road, Dapodi, Pune - 411012, Maharashtra", "Net 30 Days", 4.9, now_iso),
        ("SUP-005", "Indian Oil Corp - Industrial Lubricants", "Indian Oil Corporation Limited", "27AAACI1681G1Z4", "27", "Maharashtra", "Anand Deshmukh", "9820045123", "lubesales.pune@indianoil.in", "IOCL Terminal, Shirwal MIDC, Satara-Pune Highway - 412801", "Immediate", 4.5, now_iso),
        ("SUP-006", "PackWell Industrial Packaging", "PackWell Solutions LLP", "29AABCP5541K1ZQ", "29", "Karnataka", "M. S. Rao", "9448032110", "orders@packwellbox.com", "Peenya 2nd Stage, Industrial Suburb, Bengaluru - 560058, Karnataka", "Net 15 Days", 4.3, now_iso)
    ]
    cursor.executemany("""
        INSERT INTO suppliers (id, name, legal_name, gstin, state_code, state_name, contact_person, phone, email, address, payment_terms, rating, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, suppliers)

    # 4. Seed Inventory
    inventory = [
        ("INV-101", "RM-EN8D-25MM", "MS Bright Round Bar EN8D Ø25mm", "Raw Materials", "7214", "Kgs", 850.0, 1000.0, 300.0, 72.00, 18.0, "SUP-001", "Rack A-01, Bay 2", now_iso, now_iso),
        ("INV-102", "RM-SS304-19HEX", "SS 304 Hex Rod 19mm A/F (Cold Drawn)", "Raw Materials", "7222", "Kgs", 420.0, 300.0, 100.0, 245.00, 18.0, "SUP-002", "Rack A-04, Bay 3", now_iso, now_iso),
        ("INV-103", "RM-CRCA-1.6MM", "CRCA Sheet 1.6mm x 1250mm x 2500mm Grade D", "Raw Materials", "7209", "Kgs", 420.0, 600.0, 200.0, 78.50, 18.0, "SUP-001", "Plate Yard P-02", now_iso, now_iso),
        ("INV-104", "RM-AL6061-50MM", "Aluminium 6061-T6 Round Bar Ø50mm Extruded", "Raw Materials", "7604", "Kgs", 210.0, 150.0, 50.0, 310.00, 18.0, "SUP-002", "Rack A-07, Bay 1", now_iso, now_iso),
        ("INV-201", "FAS-HEX-M10X50", "High Tensile Hex Bolt M10x50mm (Grade 8.8 Black)", "Fasteners", "7318", "Nos", 2400.0, 1000.0, 400.0, 6.50, 18.0, "SUP-003", "Bin C-12", now_iso, now_iso),
        ("INV-202", "FAS-NYL-M10", "Nyloc Locking Nut M10 (Zinc Yellow Plated)", "Fasteners", "7318", "Nos", 450.0, 1200.0, 300.0, 2.20, 18.0, "SUP-003", "Bin C-14", now_iso, now_iso),
        ("INV-203", "FAS-SHCS-M8X25", "Socket Head Cap Screw M8x25mm (Grade 12.9)", "Fasteners", "7318", "Nos", 1650.0, 800.0, 250.0, 4.80, 18.0, "SUP-003", "Bin C-18", now_iso, now_iso),
        ("INV-301", "TOL-CNMG-120408", "CNC Carbide Turning Insert CNMG 120408-PM 4325", "Tools & Consumables", "8209", "Nos", 18.0, 40.0, 10.0, 380.00, 18.0, "SUP-004", "Tool Crib T-01", now_iso, now_iso),
        ("INV-302", "TOL-EM-4F-10MM", "Solid Carbide End Mill 4-Flute Ø10mm AlTiN Coated", "Tools & Consumables", "8207", "Nos", 14.0, 10.0, 5.0, 1150.00, 18.0, "SUP-004", "Tool Crib T-03", now_iso, now_iso),
        ("INV-401", "OIL-SERVOCUT-S", "Water Soluble Metal Cutting Coolant (Servo Cut S)", "Oils & Chemicals", "2710", "Litres", 220.0, 200.0, 50.0, 165.00, 18.0, "SUP-005", "Oil Shed Drum 03", now_iso, now_iso),
        ("INV-402", "OIL-HYD-68", "Anti-Wear Machine Hydraulic Oil ISO VG 68", "Oils & Chemicals", "2710", "Litres", 45.0, 100.0, 30.0, 142.00, 18.0, "SUP-005", "Oil Shed Drum 06", now_iso, now_iso),
        ("INV-501", "PKG-5PLY-350X250", "Heavy Duty Corrugated Box 350x250x200mm (5-Ply Kraft)", "Packaging", "4819", "Nos", 1250.0, 500.0, 200.0, 28.00, 12.0, "SUP-006", "Packaging Loft", now_iso, now_iso)
    ]
    cursor.executemany("""
        INSERT INTO inventory (id, sku, name, category, hsn, uom, current_stock, reorder_level, safety_stock, unit_price, tax_rate, preferred_supplier_id, location, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, inventory)

    # 5. Seed Purchase Orders
    po1_items = [{
        "inventoryId": "INV-101", "sku": "RM-EN8D-25MM", "name": "MS Bright Round Bar EN8D Ø25mm",
        "hsn": "7214", "uom": "Kgs", "orderQty": 1000, "unitPrice": 72.00, "taxRate": 18,
        "discountPercent": 2, "taxableAmount": 70560.00, "cgstRate": 9, "cgstAmount": 6350.40,
        "sgstRate": 9, "sgstAmount": 6350.40, "igstRate": 0, "igstAmount": 0.00, "totalAmount": 83260.80, "receivedQty": 500
    }]
    po2_items = [{
        "inventoryId": "INV-102", "sku": "RM-SS304-19HEX", "name": "SS 304 Hex Rod 19mm A/F (Cold Drawn)",
        "hsn": "7222", "uom": "Kgs", "orderQty": 250, "unitPrice": 245.00, "taxRate": 18,
        "discountPercent": 0, "taxableAmount": 61250.00, "cgstRate": 0, "cgstAmount": 0.00,
        "sgstRate": 0, "sgstAmount": 0.00, "igstRate": 18, "igstAmount": 11025.00, "totalAmount": 72275.00, "receivedQty": 250
    }]
    po3_items = [{
        "inventoryId": "INV-301", "sku": "TOL-CNMG-120408", "name": "CNC Carbide Turning Insert CNMG 120408-PM 4325",
        "hsn": "8209", "uom": "Nos", "orderQty": 40, "unitPrice": 380.00, "taxRate": 18,
        "discountPercent": 5, "taxableAmount": 14440.00, "cgstRate": 9, "cgstAmount": 1299.60,
        "sgstRate": 9, "sgstAmount": 1299.60, "igstRate": 0, "igstAmount": 0.00, "totalAmount": 17039.20, "receivedQty": 0
    }]
    po4_items = [{
        "inventoryId": "INV-202", "sku": "FAS-NYL-M10", "name": "Nyloc Locking Nut M10 (Zinc Yellow Plated)",
        "hsn": "7318", "uom": "Nos", "orderQty": 1000, "unitPrice": 2.20, "taxRate": 18,
        "discountPercent": 0, "taxableAmount": 2200.00, "cgstRate": 0, "cgstAmount": 0.00,
        "sgstRate": 0, "sgstAmount": 0.00, "igstRate": 18, "igstAmount": 396.00, "totalAmount": 2596.00, "receivedQty": 0
    }]

    pos = [
        ("PO-2024-001", "PO/2024-25/0101", "2024-10-10", "2024-10-18", "SUP-001", "Tata Steel Tubes & Rods Depot", "27AAACT2727Q1ZW", "27", "Partially Received", 70560.00, 6350.40, 6350.40, 0.00, 0.20, 83261.00, "Material test certificate (MTC) required along with delivery.", "Net 30 Days", json.dumps(po1_items), "Amit Patel", now_iso),
        ("PO-2024-002", "PO/2024-25/0102", "2024-10-12", "2024-10-20", "SUP-002", "Jindal Stainless Alloys Ltd.", "24AABCS9821L1ZM", "24", "Completed", 61250.00, 0.00, 0.00, 11025.00, 0.00, 72275.00, "Inter-state supply under IGST. Dispatch by VRL Logistics.", "Net 45 Days", json.dumps(po2_items), "Amit Patel", now_iso),
        ("PO-2024-003", "PO/2024-25/0103", "2024-10-22", "2024-10-30", "SUP-004", "Sandvik Coromant Cutting Tools", "27AAACS4412R1Z3", "27", "Issued", 14440.00, 1299.60, 1299.60, 0.00, -0.20, 17039.00, "Urgent tool replenishment for VMC Shop.", "Net 30 Days", json.dumps(po3_items), "Amit Patel", now_iso),
        ("PO-2024-004", "PO/2024-25/0104", "2024-10-25", "2024-11-02", "SUP-003", "Unbrako Fasteners India", "06AACCL8432M1ZP", "06", "Issued", 2200.00, 0.00, 0.00, 396.00, 0.00, 2596.00, "Critical shortage item for assembly line.", "Net 15 Days", json.dumps(po4_items), "Amit Patel", now_iso)
    ]
    cursor.executemany("""
        INSERT INTO purchase_orders (id, po_number, po_date, expected_delivery_date, supplier_id, supplier_name, supplier_gstin, supplier_state_code, status, subtotal, cgst_total, sgst_total, igst_total, round_off, grand_total, notes, payment_terms, items, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, pos)

    # 6. Seed GRNs
    grn1_items = [{
        "inventoryId": "INV-101", "sku": "RM-EN8D-25MM", "name": "MS Bright Round Bar EN8D Ø25mm",
        "orderedQty": 1000, "previouslyReceivedQty": 0, "receivedQty": 500, "acceptedQty": 490,
        "rejectedQty": 10, "rejectionReason": "Surface pitting on 2 bar ends", "batchNumber": "HEAT-B7721-EN8D", "unitPrice": 72.00
    }]
    grn2_items = [{
        "inventoryId": "INV-102", "sku": "RM-SS304-19HEX", "name": "SS 304 Hex Rod 19mm A/F (Cold Drawn)",
        "orderedQty": 250, "previouslyReceivedQty": 0, "receivedQty": 250, "acceptedQty": 250,
        "rejectedQty": 0, "rejectionReason": "None", "batchNumber": "JS-SS304-092", "unitPrice": 245.00
    }]

    grns = [
        ("GRN-2024-001", "GRN/24-25/0088", "2024-10-15", "PO-2024-001", "PO/2024-25/0101", "SUP-001", "Tata Steel Tubes & Rods Depot", "DC-TS-99214", "2024-10-14", "MH 14 EM 8421", "GE-2024-1142", "First lot received in sound condition. 10 kg bar ends rejected due to surface pittings.", "Approved", "Sunil Jadhav", json.dumps(grn1_items), now_iso),
        ("GRN-2024-002", "GRN/24-25/0089", "2024-10-18", "PO-2024-002", "PO/2024-25/0102", "SUP-002", "Jindal Stainless Alloys Ltd.", "INV-JSL-4512", "2024-10-16", "GJ 06 AX 9920", "GE-2024-1158", "100% material verified with mill test certificate. Dimensions in tolerance.", "Approved", "Sunil Jadhav", json.dumps(grn2_items), now_iso)
    ]
    cursor.executemany("""
        INSERT INTO grns (id, grn_number, grn_date, po_id, po_number, supplier_id, supplier_name, challan_number, challan_date, vehicle_number, gate_entry_number, remarks, status, received_by, items, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, grns)

    # 7. Seed GST Invoices
    inv1_hsn = [{"hsn": "7214", "taxable": 35280.00, "rate": 18, "cgst": 3175.20, "sgst": 3175.20, "igst": 0}]
    inv2_hsn = [{"hsn": "7222", "taxable": 61250.00, "rate": 18, "cgst": 0, "sgst": 0, "igst": 11025.00}]
    inv3_hsn = [{"hsn": "2710", "taxable": 33000.00, "rate": 18, "cgst": 2970.00, "sgst": 2970.00, "igst": 0}]

    invoices = [
        ("INV-REC-001", "TSL/WAG/24/4912", "2024-10-15", "SUP-001", "Tata Steel Tubes & Rods Depot", "27AAACT2727Q1ZW", "27", "PO/2024-25/0101", "GRN/24-25/0088", 35280.00, "INTRA_STATE", 9.0, 3175.20, 9.0, 3175.20, 0.0, 0.0, -0.40, 41630.00, "Eligible", 1, "Matched", "Pending", "2024-11-14", json.dumps(inv1_hsn), "Pooja Kulkarni", now_iso),
        ("INV-REC-002", "JSL/BRD/2425/0821", "2024-10-16", "SUP-002", "Jindal Stainless Alloys Ltd.", "24AABCS9821L1ZM", "24", "PO/2024-25/0102", "GRN/24-25/0089", 61250.00, "INTER_STATE", 0.0, 0.0, 0.0, 0.0, 18.0, 11025.00, 0.00, 72275.00, "Eligible", 1, "Matched", "Pending", "2024-11-30", json.dumps(inv2_hsn), "Pooja Kulkarni", now_iso),
        ("INV-REC-003", "IOCL/PUN/24/09121", "2024-10-05", "SUP-005", "Indian Oil Corp - Industrial Lubricants", "27AAACI1681G1Z4", "27", "Direct Invoice", "Direct Receipt", 33000.00, "INTRA_STATE", 9.0, 2970.00, 9.0, 2970.00, 0.0, 0.0, 0.00, 38940.00, "Eligible", 1, "Matched", "Paid", "2024-10-05", json.dumps(inv3_hsn), "Pooja Kulkarni", now_iso)
    ]
    cursor.executemany("""
        INSERT INTO gst_invoices (id, invoice_number, invoice_date, supplier_id, supplier_name, supplier_gstin, supplier_state_code, po_number, grn_number, taxable_amount, tax_type, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, round_off, total_invoice_amount, itc_eligibility, itc_claimed, gstr2b_status, payment_status, due_date, hsn_summary, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, invoices)

    # 8. Log initial audit entry
    cursor.execute("""
        INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, timestamp)
        VALUES ('USR-001', 'admin', 'SYSTEM_INIT', 'DATABASE', 'udyog_erp.db', 'Initialized enterprise SQLite database with Indian MSME seed dataset and 5 user roles', ?)
    """, (now_iso,))

    conn.commit()
    print("✓ UdyogERP SQLite database seeded with authentic Indian manufacturing master data.")

# ============================================================================
# USER & AUTHENTICATION REPOSITORY
# ============================================================================

def get_user_by_username(username: str):
    """Retrieve user record by username (case-insensitive)."""
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?);", (username.strip(),)).fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_id(user_id: str):
    """Retrieve user record by ID."""
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?;", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None

def get_all_users():
    """Retrieve all users without password hashes."""
    conn = get_connection()
    rows = conn.execute("SELECT id, username, full_name, email, role, department, avatar_text, created_at, last_login FROM users ORDER BY created_at ASC;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def create_user(username, password, full_name, email, role="Plant Manager", department=None):
    """Creates a new user with hashed password."""
    conn = get_connection()
    cursor = conn.cursor()

    # Generate initials for avatar
    names = full_name.strip().split()
    avatar_text = "".join(n[0].upper() for n in names[:2]) if names else "U"

    user_id = f"USR-{secrets.token_hex(4).upper()}"
    pwd_hash, salt = hash_password(password)
    now_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO users (id, username, password_hash, salt, full_name, email, role, department, avatar_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, username.strip(), pwd_hash, salt, full_name.strip(), email.strip(), role, department or "Manufacturing", avatar_text, now_iso))

    conn.commit()
    conn.close()

    return {
        "id": user_id,
        "username": username.strip(),
        "fullName": full_name.strip(),
        "email": email.strip(),
        "role": role,
        "department": department or "Manufacturing",
        "avatarText": avatar_text
    }

def authenticate_user(username_or_email, password):
    """Validates user credentials and generates a session token."""
    conn = get_connection()
    cursor = conn.cursor()

    row = cursor.execute("""
        SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?);
    """, (username_or_email.strip(), username_or_email.strip())).fetchone()

    if not row:
        conn.close()
        return None, "User not found with provided credentials"

    user = dict(row)
    if not verify_password(user["password_hash"], user["salt"], password):
        conn.close()
        return None, "Invalid password"

    # Create session token valid for 7 days
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    expires_at = (now + timedelta(days=7)).isoformat()

    cursor.execute("""
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, user["id"], now.isoformat(), expires_at))

    # Update last login
    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?;", (now.isoformat(), user["id"]))

    # Log audit entry
    cursor.execute("""
        INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, timestamp)
        VALUES (?, ?, 'USER_LOGIN', 'AUTH', ?, 'User successfully signed in', ?)
    """, (user["id"], user["username"], user["id"], now.isoformat()))

    conn.commit()
    conn.close()

    user_info = {
        "id": user["id"],
        "username": user["username"],
        "fullName": user["full_name"],
        "email": user["email"],
        "role": user["role"],
        "department": user["department"],
        "avatarText": user["avatar_text"],
        "lastLogin": now.isoformat()
    }

    return {"token": token, "user": user_info, "expiresAt": expires_at}, None

def get_user_from_token(token):
    """Returns the authenticated user for a valid, non-expired session token."""
    if not token:
        return None
    conn = get_connection()
    now_iso = datetime.now().isoformat()
    row = conn.execute("""
        SELECT u.id, u.username, u.full_name, u.email, u.role, u.department, u.avatar_text, u.last_login
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?;
    """, (token, now_iso)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "fullName": row["full_name"],
        "email": row["email"],
        "role": row["role"],
        "department": row["department"],
        "avatarText": row["avatar_text"],
        "lastLogin": row["last_login"]
    }

def delete_session(token):
    """Deletes an active session token (Logout)."""
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?;", (token,))
    conn.commit()
    conn.close()
    return True

# ============================================================================
# COMPANY REPOSITORY
# ============================================================================

def get_company():
    conn = get_connection()
    row = conn.execute("SELECT * FROM company WHERE id = 1;").fetchone()
    conn.close()
    if not row:
        return None
    c = dict(row)
    c["bankDetails"] = json.loads(c["bank_details"]) if c.get("bank_details") else {}
    c["stateCode"] = c["state_code"]
    c["stateName"] = c["state_name"]
    c["tradeName"] = c["trade_name"]
    c["msmeRegNo"] = c["msme_reg_no"]
    return c

def update_company(data):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now().isoformat()
    bank_details_json = json.dumps(data.get("bankDetails", {}))

    cursor.execute("""
        UPDATE company SET
            name = COALESCE(?, name),
            trade_name = COALESCE(?, trade_name),
            gstin = COALESCE(?, gstin),
            state_code = COALESCE(?, state_code),
            state_name = COALESCE(?, state_name),
            address = COALESCE(?, address),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            msme_reg_no = COALESCE(?, msme_reg_no),
            pan = COALESCE(?, pan),
            cin = COALESCE(?, cin),
            bank_details = COALESCE(?, bank_details),
            updated_at = ?
        WHERE id = 1;
    """, (
        data.get("name"),
        data.get("tradeName"),
        data.get("gstin"),
        data.get("stateCode"),
        data.get("stateName"),
        data.get("address"),
        data.get("phone"),
        data.get("email"),
        data.get("msmeRegNo"),
        data.get("pan"),
        data.get("cin"),
        bank_details_json if "bankDetails" in data else None,
        now_iso
    ))
    conn.commit()
    conn.close()
    return get_company()

# ============================================================================
# SUPPLIERS REPOSITORY
# ============================================================================

def get_suppliers():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM suppliers ORDER BY name ASC;").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["stateCode"] = d["state_code"]
        d["stateName"] = d["state_name"]
        d["contactPerson"] = d["contact_person"]
        d["paymentTerms"] = d["payment_terms"]
        d["legalName"] = d["legal_name"]
        result.append(d)
    return result

def get_supplier_by_id(supplier_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM suppliers WHERE id = ?;", (supplier_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["stateCode"] = d["state_code"]
    d["stateName"] = d["state_name"]
    d["contactPerson"] = d["contact_person"]
    d["paymentTerms"] = d["payment_terms"]
    d["legalName"] = d["legal_name"]
    return d

def save_supplier(supplier):
    conn = get_connection()
    cursor = conn.cursor()
    supp_id = supplier.get("id")
    if not supp_id:
        cursor.execute("SELECT COUNT(*) FROM suppliers;")
        count = cursor.fetchone()[0]
        supp_id = f"SUP-{count + 1:03d}"
        supplier["id"] = supp_id

    state_code = supplier.get("stateCode") or (supplier.get("gstin", "")[:2] if len(supplier.get("gstin", "")) >= 2 else "")
    now_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO suppliers (id, name, legal_name, gstin, state_code, state_name, contact_person, phone, email, address, payment_terms, rating, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            legal_name = excluded.legal_name,
            gstin = excluded.gstin,
            state_code = excluded.state_code,
            state_name = excluded.state_name,
            contact_person = excluded.contact_person,
            phone = excluded.phone,
            email = excluded.email,
            address = excluded.address,
            payment_terms = excluded.payment_terms,
            rating = excluded.rating;
    """, (
        supp_id,
        supplier.get("name"),
        supplier.get("legalName") or supplier.get("name"),
        supplier.get("gstin"),
        state_code,
        supplier.get("stateName", "Maharashtra"),
        supplier.get("contactPerson"),
        supplier.get("phone"),
        supplier.get("email"),
        supplier.get("address"),
        supplier.get("paymentTerms", "Net 30 Days"),
        float(supplier.get("rating", 4.5)),
        supplier.get("createdAt") or now_iso
    ))
    conn.commit()
    conn.close()
    return get_supplier_by_id(supp_id)

def delete_supplier(supplier_id):
    conn = get_connection()
    conn.execute("DELETE FROM suppliers WHERE id = ?;", (supplier_id,))
    conn.commit()
    conn.close()
    return True

# ============================================================================
# INVENTORY REPOSITORY
# ============================================================================

def get_inventory(category=None, low_stock_only=False):
    conn = get_connection()
    query = "SELECT * FROM inventory WHERE 1=1"
    params = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if low_stock_only:
        query += " AND current_stock <= reorder_level"
    query += " ORDER BY sku ASC;"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["currentStock"] = d["current_stock"]
        d["reorderLevel"] = d["reorder_level"]
        d["safetyStock"] = d["safety_stock"]
        d["unitPrice"] = d["unit_price"]
        d["taxRate"] = d["tax_rate"]
        d["preferredSupplierId"] = d["preferred_supplier_id"]
        result.append(d)
    return result

def get_inventory_item(item_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM inventory WHERE id = ?;", (item_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["currentStock"] = d["current_stock"]
    d["reorderLevel"] = d["reorder_level"]
    d["safetyStock"] = d["safety_stock"]
    d["unitPrice"] = d["unit_price"]
    d["taxRate"] = d["tax_rate"]
    d["preferredSupplierId"] = d["preferred_supplier_id"]
    return d

def save_inventory_item(item):
    conn = get_connection()
    cursor = conn.cursor()
    item_id = item.get("id")
    if not item_id:
        cursor.execute("SELECT COUNT(*) FROM inventory;")
        count = cursor.fetchone()[0]
        item_id = f"INV-{count + 101}"
        item["id"] = item_id

    now_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO inventory (id, sku, name, category, hsn, uom, current_stock, reorder_level, safety_stock, unit_price, tax_rate, preferred_supplier_id, location, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            sku = excluded.sku,
            name = excluded.name,
            category = excluded.category,
            hsn = excluded.hsn,
            uom = excluded.uom,
            current_stock = excluded.current_stock,
            reorder_level = excluded.reorder_level,
            safety_stock = excluded.safety_stock,
            unit_price = excluded.unit_price,
            tax_rate = excluded.tax_rate,
            preferred_supplier_id = excluded.preferred_supplier_id,
            location = excluded.location,
            updated_at = excluded.updated_at;
    """, (
        item_id,
        item.get("sku"),
        item.get("name"),
        item.get("category", "Raw Materials"),
        item.get("hsn"),
        item.get("uom", "Nos"),
        float(item.get("currentStock", 0)),
        float(item.get("reorderLevel", 0)),
        float(item.get("safetyStock", 0)),
        float(item.get("unitPrice", 0)),
        float(item.get("taxRate", 18)),
        item.get("preferredSupplierId"),
        item.get("location", "Warehouse"),
        item.get("createdAt") or now_iso,
        now_iso
    ))
    conn.commit()
    conn.close()
    return get_inventory_item(item_id)

def update_inventory_stock(item_id, delta_qty):
    """Atomically increments/decrements inventory stock."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE inventory 
        SET current_stock = ROUND(current_stock + ?, 2),
            updated_at = ?
        WHERE id = ?;
    """, (float(delta_qty), datetime.now().isoformat(), item_id))
    conn.commit()
    conn.close()
    return get_inventory_item(item_id)

def delete_inventory_item(item_id):
    conn = get_connection()
    conn.execute("DELETE FROM inventory WHERE id = ?;", (item_id,))
    conn.commit()
    conn.close()
    return True

# ============================================================================
# PURCHASE ORDERS REPOSITORY
# ============================================================================

def get_purchase_orders(status=None):
    conn = get_connection()
    query = "SELECT * FROM purchase_orders"
    params = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY po_date DESC, created_at DESC;"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["poNumber"] = d["po_number"]
        d["poDate"] = d["po_date"]
        d["expectedDeliveryDate"] = d["expected_delivery_date"]
        d["supplierId"] = d["supplier_id"]
        d["supplierName"] = d["supplier_name"]
        d["supplierGstin"] = d["supplier_gstin"]
        d["supplierStateCode"] = d["supplier_state_code"]
        d["cgstTotal"] = d["cgst_total"]
        d["sgstTotal"] = d["sgst_total"]
        d["igstTotal"] = d["igst_total"]
        d["roundOff"] = d["round_off"]
        d["grandTotal"] = d["grand_total"]
        d["paymentTerms"] = d["payment_terms"]
        d["createdBy"] = d["created_by"]
        d["createdAt"] = d["created_at"]
        d["items"] = json.loads(d["items"]) if d.get("items") else []
        result.append(d)
    return result

def get_purchase_order_by_id(po_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM purchase_orders WHERE id = ?;", (po_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["poNumber"] = d["po_number"]
    d["poDate"] = d["po_date"]
    d["expectedDeliveryDate"] = d["expected_delivery_date"]
    d["supplierId"] = d["supplier_id"]
    d["supplierName"] = d["supplier_name"]
    d["supplierGstin"] = d["supplier_gstin"]
    d["supplierStateCode"] = d["supplier_state_code"]
    d["cgstTotal"] = d["cgst_total"]
    d["sgstTotal"] = d["sgst_total"]
    d["igstTotal"] = d["igst_total"]
    d["roundOff"] = d["round_off"]
    d["grandTotal"] = d["grand_total"]
    d["paymentTerms"] = d["payment_terms"]
    d["createdBy"] = d["created_by"]
    d["createdAt"] = d["created_at"]
    d["items"] = json.loads(d["items"]) if d.get("items") else []
    return d

def save_purchase_order(po):
    conn = get_connection()
    cursor = conn.cursor()
    po_id = po.get("id")
    if not po_id:
        cursor.execute("SELECT COUNT(*) FROM purchase_orders;")
        count = cursor.fetchone()[0]
        po_id = f"PO-2024-{count + 101:03d}"
        po["id"] = po_id

    items_json = json.dumps(po.get("items", []))
    now_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO purchase_orders (id, po_number, po_date, expected_delivery_date, supplier_id, supplier_name, supplier_gstin, supplier_state_code, status, subtotal, cgst_total, sgst_total, igst_total, round_off, grand_total, notes, payment_terms, items, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            po_number = excluded.po_number,
            po_date = excluded.po_date,
            expected_delivery_date = excluded.expected_delivery_date,
            supplier_id = excluded.supplier_id,
            supplier_name = excluded.supplier_name,
            supplier_gstin = excluded.supplier_gstin,
            supplier_state_code = excluded.supplier_state_code,
            status = excluded.status,
            subtotal = excluded.subtotal,
            cgst_total = excluded.cgst_total,
            sgst_total = excluded.sgst_total,
            igst_total = excluded.igst_total,
            round_off = excluded.round_off,
            grand_total = excluded.grand_total,
            notes = excluded.notes,
            payment_terms = excluded.payment_terms,
            items = excluded.items,
            created_by = excluded.created_by;
    """, (
        po_id,
        po.get("poNumber") or f"PO/24-25/{po_id[-4:]}",
        po.get("poDate") or datetime.now().strftime("%Y-%m-%d"),
        po.get("expectedDeliveryDate"),
        po.get("supplierId"),
        po.get("supplierName"),
        po.get("supplierGstin"),
        po.get("supplierStateCode"),
        po.get("status", "Issued"),
        float(po.get("subtotal", 0)),
        float(po.get("cgstTotal", 0)),
        float(po.get("sgstTotal", 0)),
        float(po.get("igstTotal", 0)),
        float(po.get("roundOff", 0)),
        float(po.get("grandTotal", 0)),
        po.get("notes"),
        po.get("paymentTerms", "Net 30 Days"),
        items_json,
        po.get("createdBy") or "Admin",
        po.get("createdAt") or now_iso
    ))
    conn.commit()
    conn.close()
    return get_purchase_order_by_id(po_id)

def update_po_received_qty(po_id, inventory_id, qty_received):
    """Updates received quantity inside PO items and adjusts status."""
    po = get_purchase_order_by_id(po_id)
    if not po or not po.get("items"):
        return None

    items = po["items"]
    for it in items:
        if it.get("inventoryId") == inventory_id:
            it["receivedQty"] = (float(it.get("receivedQty", 0)) + float(qty_received))

    all_completed = all(float(i.get("receivedQty", 0)) >= float(i.get("orderQty", 0)) for i in items)
    any_received = any(float(i.get("receivedQty", 0)) > 0 for i in items)

    new_status = "Completed" if all_completed else ("Partially Received" if any_received else "Issued")
    po["status"] = new_status
    po["items"] = items

    return save_purchase_order(po)

# ============================================================================
# GOODS RECEIPT NOTES (GRN) REPOSITORY
# ============================================================================

def get_grns():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM grns ORDER BY grn_date DESC, created_at DESC;").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["grnNumber"] = d["grn_number"]
        d["grnDate"] = d["grn_date"]
        d["poId"] = d["po_id"]
        d["poNumber"] = d["po_number"]
        d["supplierId"] = d["supplier_id"]
        d["supplierName"] = d["supplier_name"]
        d["challanNumber"] = d["challan_number"]
        d["challanDate"] = d["challan_date"]
        d["vehicleNumber"] = d["vehicle_number"]
        d["gateEntryNumber"] = d["gate_entry_number"]
        d["receivedBy"] = d["received_by"]
        d["createdAt"] = d["created_at"]
        d["items"] = json.loads(d["items"]) if d.get("items") else []
        result.append(d)
    return result

def get_grn_by_id(grn_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM grns WHERE id = ?;", (grn_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["grnNumber"] = d["grn_number"]
    d["grnDate"] = d["grn_date"]
    d["poId"] = d["po_id"]
    d["poNumber"] = d["po_number"]
    d["supplierId"] = d["supplier_id"]
    d["supplierName"] = d["supplier_name"]
    d["challanNumber"] = d["challan_number"]
    d["challanDate"] = d["challan_date"]
    d["vehicleNumber"] = d["vehicle_number"]
    d["gateEntryNumber"] = d["gate_entry_number"]
    d["receivedBy"] = d["received_by"]
    d["createdAt"] = d["created_at"]
    d["items"] = json.loads(d["items"]) if d.get("items") else []
    return d

def save_grn_with_stock_sync(grn_data, update_stock=True):
    """
    Saves a GRN and atomically increments physical inventory stock in SQLite.
    Also syncs the linked Purchase Order received quantities.
    """
    conn = get_connection()
    cursor = conn.cursor()

    grn_id = grn_data.get("id")
    if not grn_id:
        cursor.execute("SELECT COUNT(*) FROM grns;")
        count = cursor.fetchone()[0]
        grn_id = f"GRN-2024-{count + 101:03d}"
        grn_data["id"] = grn_id

    items = grn_data.get("items", [])
    items_json = json.dumps(items)
    now_iso = datetime.now().isoformat()

    try:
        # 1. Insert or Update GRN
        cursor.execute("""
            INSERT INTO grns (id, grn_number, grn_date, po_id, po_number, supplier_id, supplier_name, challan_number, challan_date, vehicle_number, gate_entry_number, remarks, status, received_by, items, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                grn_number = excluded.grn_number,
                grn_date = excluded.grn_date,
                po_id = excluded.po_id,
                po_number = excluded.po_number,
                supplier_id = excluded.supplier_id,
                supplier_name = excluded.supplier_name,
                challan_number = excluded.challan_number,
                challan_date = excluded.challan_date,
                vehicle_number = excluded.vehicle_number,
                gate_entry_number = excluded.gate_entry_number,
                remarks = excluded.remarks,
                status = excluded.status,
                received_by = excluded.received_by,
                items = excluded.items;
        """, (
            grn_id,
            grn_data.get("grnNumber") or f"GRN/24-25/{grn_id[-4:]}",
            grn_data.get("grnDate") or datetime.now().strftime("%Y-%m-%d"),
            grn_data.get("poId"),
            grn_data.get("poNumber"),
            grn_data.get("supplierId"),
            grn_data.get("supplierName"),
            grn_data.get("challanNumber"),
            grn_data.get("challanDate"),
            grn_data.get("vehicleNumber"),
            grn_data.get("gateEntryNumber"),
            grn_data.get("remarks"),
            grn_data.get("status", "Approved"),
            grn_data.get("receivedBy", "Store Keeper"),
            items_json,
            grn_data.get("createdAt") or now_iso
        ))

        # 2. Update physical inventory balances atomically if requested
        if update_stock:
            for item in items:
                inv_id = item.get("inventoryId")
                accepted = float(item.get("acceptedQty", 0))
                if inv_id and accepted > 0:
                    cursor.execute("""
                        UPDATE inventory
                        SET current_stock = ROUND(current_stock + ?, 2),
                            updated_at = ?
                        WHERE id = ?;
                    """, (accepted, now_iso, inv_id))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise e

    conn.close()

    # 3. Update PO received quantity if linked
    po_id = grn_data.get("poId")
    if po_id:
        for item in items:
            inv_id = item.get("inventoryId")
            accepted = float(item.get("acceptedQty", 0))
            if inv_id and accepted > 0:
                update_po_received_qty(po_id, inv_id, accepted)

    return get_grn_by_id(grn_id)

# ============================================================================
# GST INVOICES (PURCHASE REGISTER) REPOSITORY
# ============================================================================

def get_gst_invoices():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM gst_invoices ORDER BY invoice_date DESC, created_at DESC;").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["invoiceNumber"] = d["invoice_number"]
        d["invoiceDate"] = d["invoice_date"]
        d["supplierId"] = d["supplier_id"]
        d["supplierName"] = d["supplier_name"]
        d["supplierGstin"] = d["supplier_gstin"]
        d["supplierStateCode"] = d["supplier_state_code"]
        d["poNumber"] = d["po_number"]
        d["grnNumber"] = d["grn_number"]
        d["taxableAmount"] = d["taxable_amount"]
        d["taxType"] = d["tax_type"]
        d["cgstRate"] = d["cgst_rate"]
        d["cgstAmount"] = d["cgst_amount"]
        d["sgstRate"] = d["sgst_rate"]
        d["sgstAmount"] = d["sgst_amount"]
        d["igstRate"] = d["igst_rate"]
        d["igstAmount"] = d["igst_amount"]
        d["roundOff"] = d["round_off"]
        d["totalInvoiceAmount"] = d["total_invoice_amount"]
        d["itcEligibility"] = d["itc_eligibility"]
        d["itcClaimed"] = bool(d["itc_claimed"])
        d["gstr2bStatus"] = d["gstr2b_status"]
        d["paymentStatus"] = d["payment_status"]
        d["dueDate"] = d["due_date"]
        d["hsnSummary"] = json.loads(d["hsn_summary"]) if d.get("hsn_summary") else []
        d["createdBy"] = d["created_by"]
        d["createdAt"] = d["created_at"]
        result.append(d)
    return result

def get_gst_invoice_by_id(inv_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM gst_invoices WHERE id = ?;", (inv_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["invoiceNumber"] = d["invoice_number"]
    d["invoiceDate"] = d["invoice_date"]
    d["supplierId"] = d["supplier_id"]
    d["supplierName"] = d["supplier_name"]
    d["supplierGstin"] = d["supplier_gstin"]
    d["supplierStateCode"] = d["supplier_state_code"]
    d["poNumber"] = d["po_number"]
    d["grnNumber"] = d["grn_number"]
    d["taxableAmount"] = d["taxable_amount"]
    d["taxType"] = d["tax_type"]
    d["cgstRate"] = d["cgst_rate"]
    d["cgstAmount"] = d["cgst_amount"]
    d["sgstRate"] = d["sgst_rate"]
    d["sgstAmount"] = d["sgst_amount"]
    d["igstRate"] = d["igst_rate"]
    d["igstAmount"] = d["igst_amount"]
    d["roundOff"] = d["round_off"]
    d["totalInvoiceAmount"] = d["total_invoice_amount"]
    d["itcEligibility"] = d["itc_eligibility"]
    d["itcClaimed"] = bool(d["itc_claimed"])
    d["gstr2bStatus"] = d["gstr2b_status"]
    d["paymentStatus"] = d["payment_status"]
    d["dueDate"] = d["due_date"]
    d["hsnSummary"] = json.loads(d["hsn_summary"]) if d.get("hsn_summary") else []
    d["createdBy"] = d["created_by"]
    d["createdAt"] = d["created_at"]
    return d

def save_gst_invoice(inv):
    conn = get_connection()
    cursor = conn.cursor()
    inv_id = inv.get("id")
    if not inv_id:
        cursor.execute("SELECT COUNT(*) FROM gst_invoices;")
        count = cursor.fetchone()[0]
        inv_id = f"INV-REC-{count + 1:04d}"
        inv["id"] = inv_id

    hsn_json = json.dumps(inv.get("hsnSummary", []))
    now_iso = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO gst_invoices (id, invoice_number, invoice_date, supplier_id, supplier_name, supplier_gstin, supplier_state_code, po_number, grn_number, taxable_amount, tax_type, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, round_off, total_invoice_amount, itc_eligibility, itc_claimed, gstr2b_status, payment_status, due_date, hsn_summary, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            invoice_number = excluded.invoice_number,
            invoice_date = excluded.invoice_date,
            supplier_id = excluded.supplier_id,
            supplier_name = excluded.supplier_name,
            supplier_gstin = excluded.supplier_gstin,
            supplier_state_code = excluded.supplier_state_code,
            po_number = excluded.po_number,
            grn_number = excluded.grn_number,
            taxable_amount = excluded.taxable_amount,
            tax_type = excluded.tax_type,
            cgst_rate = excluded.cgst_rate,
            cgst_amount = excluded.cgst_amount,
            sgst_rate = excluded.sgst_rate,
            sgst_amount = excluded.sgst_amount,
            igst_rate = excluded.igst_rate,
            igst_amount = excluded.igst_amount,
            round_off = excluded.round_off,
            total_invoice_amount = excluded.total_invoice_amount,
            itc_eligibility = excluded.itc_eligibility,
            itc_claimed = excluded.itc_claimed,
            gstr2b_status = excluded.gstr2b_status,
            payment_status = excluded.payment_status,
            due_date = excluded.due_date,
            hsn_summary = excluded.hsn_summary,
            created_by = excluded.created_by;
    """, (
        inv_id,
        inv.get("invoiceNumber"),
        inv.get("invoiceDate") or datetime.now().strftime("%Y-%m-%d"),
        inv.get("supplierId"),
        inv.get("supplierName"),
        inv.get("supplierGstin"),
        inv.get("supplierStateCode"),
        inv.get("poNumber"),
        inv.get("grnNumber"),
        float(inv.get("taxableAmount", 0)),
        inv.get("taxType", "INTRA_STATE"),
        float(inv.get("cgstRate", 0)),
        float(inv.get("cgstAmount", 0)),
        float(inv.get("sgstRate", 0)),
        float(inv.get("sgstAmount", 0)),
        float(inv.get("igstRate", 0)),
        float(inv.get("igstAmount", 0)),
        float(inv.get("roundOff", 0)),
        float(inv.get("totalInvoiceAmount", 0)),
        inv.get("itcEligibility", "Eligible"),
        1 if inv.get("itcClaimed", True) else 0,
        inv.get("gstr2bStatus", "Matched"),
        inv.get("paymentStatus", "Pending"),
        inv.get("dueDate"),
        hsn_json,
        inv.get("createdBy") or "Pooja Kulkarni",
        inv.get("createdAt") or now_iso
    ))
    conn.commit()
    conn.close()
    return get_gst_invoice_by_id(inv_id)

def delete_gst_invoice(inv_id):
    conn = get_connection()
    conn.execute("DELETE FROM gst_invoices WHERE id = ?;", (inv_id,))
    conn.commit()
    conn.close()
    return True

# ============================================================================
# AUDIT LOGS & DATABASE STATS
# ============================================================================

def log_audit(user_id, username, action, entity, entity_id, details):
    """Writes an audit trail record into SQLite."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    """, (user_id, username, action, entity, entity_id, details, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def get_audit_logs(limit=50):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?;", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_database_stats():
    """Returns database size, file status, and table counts."""
    ensure_data_dir()
    db_size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    conn = get_connection()
    cursor = conn.cursor()

    counts = {
        "users": cursor.execute("SELECT COUNT(*) FROM users;").fetchone()[0],
        "suppliers": cursor.execute("SELECT COUNT(*) FROM suppliers;").fetchone()[0],
        "inventory": cursor.execute("SELECT COUNT(*) FROM inventory;").fetchone()[0],
        "purchaseOrders": cursor.execute("SELECT COUNT(*) FROM purchase_orders;").fetchone()[0],
        "grns": cursor.execute("SELECT COUNT(*) FROM grns;").fetchone()[0],
        "gstInvoices": cursor.execute("SELECT COUNT(*) FROM gst_invoices;").fetchone()[0],
        "auditLogs": cursor.execute("SELECT COUNT(*) FROM audit_logs;").fetchone()[0]
    }
    conn.close()

    return {
        "status": "connected",
        "engine": "SQLite 3",
        "databaseFile": DB_PATH,
        "sizeBytes": db_size_bytes,
        "sizeFormatted": f"{db_size_bytes / 1024:.1f} KB",
        "tables": counts,
        "lastChecked": datetime.now().isoformat()
    }
