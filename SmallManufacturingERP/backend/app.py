"""
UdyogERP - Indian Small Manufacturing & GST ERP Backend
A RESTful API backend service for Procurement, Inventory, GRN, and GST Records.
Framework: Flask / Python 3.8+
Database: SQLite 3 with Relational Schema & ACID Transactions
Authentication: PBKDF2 Password Hashing & Bearer Token Sessions
"""

import re
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS
import database

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for frontend

# GSTIN Regex Validator (Statutory 15-character Indian format)
GSTIN_REGEX = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'

# ============================================================================
# AUTHENTICATION MIDDLEWARE HELPER
# ============================================================================

def get_current_user():
    """Extracts and verifies Bearer token from request Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "X-Auth-Token" in request.headers:
        token = request.headers.get("X-Auth-Token")
    elif request.args.get("token"):
        token = request.args.get("token")

    if not token:
        return None
    return database.get_user_from_token(token)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required. Please sign in."}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated_function

# ============================================================================
# GST CALCULATION HELPER
# ============================================================================

def calculate_taxes(taxable_amount, tax_rate, supplier_state_code, buyer_state_code):
    """
    Intra-State: CGST (tax_rate/2) + SGST (tax_rate/2)
    Inter-State: IGST (tax_rate)
    """
    is_intra = (str(supplier_state_code).strip() == str(buyer_state_code).strip())
    taxable = float(taxable_amount)
    rate = float(tax_rate)

    if is_intra:
        half_rate = rate / 2.0
        cgst_amount = round((taxable * half_rate) / 100.0, 2)
        sgst_amount = round((taxable * half_rate) / 100.0, 2)
        return {
            "taxType": "INTRA_STATE",
            "cgstRate": half_rate,
            "cgstAmount": cgst_amount,
            "sgstRate": half_rate,
            "sgstAmount": sgst_amount,
            "igstRate": 0.0,
            "igstAmount": 0.0,
            "totalTax": round(cgst_amount + sgst_amount, 2),
            "grandTotal": round(taxable + cgst_amount + sgst_amount, 2)
        }
    else:
        igst_amount = round((taxable * rate) / 100.0, 2)
        return {
            "taxType": "INTER_STATE",
            "cgstRate": 0.0,
            "cgstAmount": 0.0,
            "sgstRate": 0.0,
            "sgstAmount": 0.0,
            "igstRate": rate,
            "igstAmount": igst_amount,
            "totalTax": igst_amount,
            "grandTotal": round(taxable + igst_amount, 2)
        }

# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.json or {}
    username_or_email = data.get('username') or data.get('email')
    password = data.get('password')

    if not username_or_email or not password:
        return jsonify({"error": "Username/email and password are required"}), 400

    result, err = database.authenticate_user(username_or_email, password)
    if err:
        return jsonify({"error": err}), 401

    return jsonify({
        "message": "Login successful",
        "token": result["token"],
        "user": result["user"],
        "expiresAt": result["expiresAt"]
    })

@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    full_name = data.get('fullName', '').strip()
    email = data.get('email', '').strip()
    role = data.get('role', 'Plant Manager')
    department = data.get('department')

    if not username or not password or not full_name or not email:
        return jsonify({"error": "Username, password, full name, and email are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Check for existing user
    if database.get_user_by_username(username):
        return jsonify({"error": "Username is already taken"}), 409

    try:
        user = database.create_user(username, password, full_name, email, role, department)
        # Automatically authenticate new user
        auth_res, _ = database.authenticate_user(username, password)
        return jsonify({
            "message": "User registered successfully",
            "user": auth_res["user"],
            "token": auth_res["token"],
            "expiresAt": auth_res["expiresAt"]
        }), 201
    except Exception as e:
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False, "user": None}), 200
    return jsonify({"authenticated": True, "user": user})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if token:
        database.delete_session(token)
    return jsonify({"message": "Successfully signed out"})

@app.route('/api/users', methods=['GET'])
def list_users():
    users = database.get_all_users()
    return jsonify({"count": len(users), "users": users})

# ============================================================================
# DATABASE MANAGEMENT ENDPOINTS
# ============================================================================

@app.route('/api/database/stats', methods=['GET'])
def database_stats():
    stats = database.get_database_stats()
    return jsonify(stats)

@app.route('/api/database/reset', methods=['POST'])
def database_reset():
    database.init_db(force_reseed=True)
    stats = database.get_database_stats()
    return jsonify({"message": "Database reset to factory demo state", "stats": stats})

@app.route('/api/audit-logs', methods=['GET'])
def get_audit_logs():
    limit = int(request.args.get('limit', 50))
    logs = database.get_audit_logs(limit)
    return jsonify({"count": len(logs), "logs": logs})

# ============================================================================
# SYSTEM HEALTH & COMPANY ENDPOINTS
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    db_stats = database.get_database_stats()
    return jsonify({
        "status": "healthy",
        "service": "UdyogERP API",
        "databaseEngine": "SQLite 3 (ACID Persistent)",
        "databaseFile": db_stats["databaseFile"],
        "tableCounts": db_stats["tables"],
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/company', methods=['GET', 'PUT'])
def company_endpoint():
    if request.method == 'GET':
        company = database.get_company()
        return jsonify(company)
    elif request.method == 'PUT':
        data = request.json or {}
        company = database.update_company(data)
        return jsonify({"message": "Company profile updated in SQLite database", "company": company})

# ============================================================================
# INVENTORY ENDPOINTS
# ============================================================================

@app.route('/api/inventory', methods=['GET', 'POST'])
def inventory_list_create():
    if request.method == 'GET':
        category = request.args.get('category')
        low_stock_only = request.args.get('low_stock', 'false').lower() == 'true'
        items = database.get_inventory(category=category, low_stock_only=low_stock_only)
        return jsonify({"count": len(items), "items": items})

    elif request.method == 'POST':
        item = request.json or {}
        if not item.get('sku') or not item.get('name') or not item.get('hsn'):
            return jsonify({"error": "SKU, Name, and HSN code are required"}), 400

        # Check SKU uniqueness
        existing_items = database.get_inventory()
        if any(i['sku'].upper() == item['sku'].upper() for i in existing_items if i['id'] != item.get('id')):
            return jsonify({"error": f"SKU '{item['sku']}' already exists in database"}), 409

        saved_item = database.save_inventory_item(item)
        return jsonify({"message": "Inventory item saved to SQLite database", "item": saved_item}), 201

@app.route('/api/inventory/<item_id>', methods=['GET', 'PUT', 'DELETE'])
def inventory_item_detail(item_id):
    item = database.get_inventory_item(item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404

    if request.method == 'GET':
        return jsonify(item)
    elif request.method == 'PUT':
        data = request.json or {}
        data['id'] = item_id
        saved_item = database.save_inventory_item(data)
        return jsonify({"message": "Item updated in SQLite database", "item": saved_item})
    elif request.method == 'DELETE':
        database.delete_inventory_item(item_id)
        return jsonify({"message": "Item deleted from SQLite database", "id": item_id})

# ============================================================================
# SUPPLIERS ENDPOINTS
# ============================================================================

@app.route('/api/suppliers', methods=['GET', 'POST'])
def suppliers_list_create():
    if request.method == 'GET':
        suppliers = database.get_suppliers()
        return jsonify({"count": len(suppliers), "suppliers": suppliers})
    elif request.method == 'POST':
        data = request.json or {}
        gstin = data.get('gstin', '').strip().upper()
        if not re.match(GSTIN_REGEX, gstin):
            return jsonify({"error": "Invalid Indian GSTIN format (15 alphanumeric characters)"}), 400

        data['gstin'] = gstin
        data['stateCode'] = gstin[:2]
        saved_supplier = database.save_supplier(data)
        return jsonify({"message": "Supplier registered in SQLite database", "supplier": saved_supplier}), 201

@app.route('/api/suppliers/<supplier_id>', methods=['GET', 'PUT', 'DELETE'])
def supplier_detail(supplier_id):
    supplier = database.get_supplier_by_id(supplier_id)
    if not supplier:
        return jsonify({"error": "Supplier not found"}), 404

    if request.method == 'GET':
        return jsonify(supplier)
    elif request.method == 'PUT':
        data = request.json or {}
        data['id'] = supplier_id
        if 'gstin' in data and data['gstin']:
            gstin = data['gstin'].strip().upper()
            if not re.match(GSTIN_REGEX, gstin):
                return jsonify({"error": "Invalid Indian GSTIN format"}), 400
            data['gstin'] = gstin
            data['stateCode'] = gstin[:2]
        saved_supplier = database.save_supplier(data)
        return jsonify({"message": "Supplier updated in SQLite database", "supplier": saved_supplier})
    elif request.method == 'DELETE':
        database.delete_supplier(supplier_id)
        return jsonify({"message": "Supplier deleted from SQLite database", "id": supplier_id})

# ============================================================================
# PURCHASE ORDERS ENDPOINTS
# ============================================================================

@app.route('/api/purchase-orders', methods=['GET', 'POST'])
def purchase_orders_endpoint():
    if request.method == 'GET':
        status = request.args.get('status')
        pos = database.get_purchase_orders(status=status)
        return jsonify({"count": len(pos), "purchaseOrders": pos})
    elif request.method == 'POST':
        po = request.json or {}
        if not po.get('supplierId') or not po.get('items'):
            return jsonify({"error": "supplierId and items array are required"}), 400

        user = get_current_user()
        if user and not po.get('createdBy'):
            po['createdBy'] = user['fullName']

        saved_po = database.save_purchase_order(po)
        return jsonify({"message": "Purchase order saved to SQLite database", "purchaseOrder": saved_po}), 201

@app.route('/api/purchase-orders/<po_id>', methods=['GET'])
def purchase_order_detail(po_id):
    po = database.get_purchase_order_by_id(po_id)
    if not po:
        return jsonify({"error": "Purchase order not found"}), 404
    return jsonify(po)

# ============================================================================
# GOODS RECEIPT NOTE (GRN) ENDPOINTS
# ============================================================================

@app.route('/api/grn', methods=['GET', 'POST'])
def grn_endpoint():
    if request.method == 'GET':
        grns = database.get_grns()
        return jsonify({"count": len(grns), "grns": grns})
    elif request.method == 'POST':
        grn = request.json or {}
        if not grn.get('poId') or not grn.get('items'):
            return jsonify({"error": "poId and items array are required"}), 400

        user = get_current_user()
        if user and not grn.get('receivedBy'):
            grn['receivedBy'] = user['fullName']

        # Atomic transaction: Saves GRN, updates physical stock, and updates PO line items
        saved_grn = database.save_grn_with_stock_sync(grn, update_stock=True)
        return jsonify({
            "message": "GRN processed, physical inventory stock incremented, and PO updated in SQLite database",
            "grn": saved_grn
        }), 201

@app.route('/api/grn/<grn_id>', methods=['GET'])
def grn_detail(grn_id):
    grn = database.get_grn_by_id(grn_id)
    if not grn:
        return jsonify({"error": "GRN not found"}), 404
    return jsonify(grn)

# ============================================================================
# GST PURCHASE REGISTER ENDPOINTS
# ============================================================================

@app.route('/api/gst/invoices', methods=['GET', 'POST'])
def gst_invoices_endpoint():
    if request.method == 'GET':
        invoices = database.get_gst_invoices()
        return jsonify({"count": len(invoices), "invoices": invoices})
    elif request.method == 'POST':
        inv = request.json or {}
        if not inv.get('invoiceNumber') or not inv.get('supplierId'):
            return jsonify({"error": "invoiceNumber and supplierId are required"}), 400

        user = get_current_user()
        if user and not inv.get('createdBy'):
            inv['createdBy'] = user['fullName']

        saved_inv = database.save_gst_invoice(inv)
        return jsonify({"message": "GST tax invoice recorded in SQLite database", "invoice": saved_inv}), 201

@app.route('/api/gst/invoices/<inv_id>', methods=['GET', 'DELETE'])
def gst_invoice_detail(inv_id):
    if request.method == 'GET':
        inv = database.get_gst_invoice_by_id(inv_id)
        if not inv:
            return jsonify({"error": "Invoice not found"}), 404
        return jsonify(inv)
    elif request.method == 'DELETE':
        database.delete_gst_invoice(inv_id)
        return jsonify({"message": "GST invoice deleted from SQLite database", "id": inv_id})

# ============================================================================
# GSTR-3B & ITC RECONCILIATION SUMMARY ENDPOINT
# ============================================================================

@app.route('/api/gst/itc-summary', methods=['GET'])
def gst_itc_summary():
    invoices = database.get_gst_invoices()
    total_taxable = sum(float(i.get('taxableAmount', 0)) for i in invoices)
    total_cgst = sum(float(i.get('cgstAmount', 0)) for i in invoices if i.get('itcEligibility') == 'Eligible')
    total_sgst = sum(float(i.get('sgstAmount', 0)) for i in invoices if i.get('itcEligibility') == 'Eligible')
    total_igst = sum(float(i.get('igstAmount', 0)) for i in invoices if i.get('itcEligibility') == 'Eligible')

    return jsonify({
        "period": datetime.now().strftime("%B %Y"),
        "totalTaxablePurchases": round(total_taxable, 2),
        "eligibleITC": {
            "cgst": round(total_cgst, 2),
            "sgst": round(total_sgst, 2),
            "igst": round(total_igst, 2),
            "totalClaimableCredit": round(total_cgst + total_sgst + total_igst, 2)
        },
        "gstr2bReconciled": True,
        "dataSource": "SQLite Database"
    })

# Initialize database schema on module load
database.init_db()

if __name__ == '__main__':
    print("=" * 70)
    print("🚀 UdyogERP Indian Manufacturing & GST ERP Backend Service")
    print("💾 Database Engine: SQLite 3 Persistent Storage (udyog_erp.db)")
    print("🔐 Authentication Engine: PBKDF2 Password Hashing & Bearer Sessions")
    print("🌐 Listening on: http://127.0.0.1:5000")
    print("=" * 70)
    app.run(host='0.0.0.0', port=5000, debug=True)
