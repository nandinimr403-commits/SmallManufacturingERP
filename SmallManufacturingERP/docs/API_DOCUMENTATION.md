# UdyogERP - REST API Specification & Integration Guide

This document details the RESTful API endpoints required to integrate the **UdyogERP** frontend with a Python backend (or any enterprise database like PostgreSQL/MySQL/Oracle).

---

## 1. Overview & Base Configuration
- **Base URL (Local Development)**: `http://127.0.0.1:5000/api`
- **Default Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json`
- **Indian GST Currency**: All financial figures are denominated in Indian Rupees (`INR - ₹`).

---

## 2. Authentication & User Access API

UdyogERP features enterprise authentication with PBKDF2-HMAC-SHA256 hashed passwords and 7-day bearer session tokens.

### 2.1 Sign In / Login
#### `POST /api/auth/login`
Authenticates a user by username or email and generates a secure session token.
- **Request Body**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```
- **Response `200 OK`**:
```json
{
  "message": "Login successful",
  "token": "dGhpcy1pcy1hLXNlY3VyZS10b2tlbi0xMjM...",
  "user": {
    "id": "USR-001",
    "username": "admin",
    "fullName": "Rajesh Sharma",
    "email": "rajesh.sharma@shreeprecision.com",
    "role": "Admin",
    "department": "Plant Management",
    "avatarText": "RS",
    "lastLogin": "2026-10-29T03:00:00"
  },
  "expiresAt": "2026-11-05T03:00:00"
}
```

### 2.2 User Registration
#### `POST /api/auth/register`
Creates a new enterprise user account in the SQLite database.
- **Request Body**:
```json
{
  "username": "ramesh",
  "password": "securepassword123",
  "fullName": "Ramesh Kulkarni",
  "email": "ramesh.k@shreeprecision.com",
  "role": "Plant Manager",
  "department": "Machine Shop 1"
}
```

### 2.3 Verify Current Session
#### `GET /api/auth/me`
Header: `Authorization: Bearer <token>`
Returns the authenticated user details and active role.

### 2.4 Sign Out
#### `POST /api/auth/logout`
Header: `Authorization: Bearer <token>`
Invalidates the session token in the SQLite database.

### 2.5 Pre-Seeded Enterprise Demo Users
| Role | Username | Password | Full Name | Department |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Rajesh Sharma | Plant Management |
| **Plant Manager** | `manager` | `manager123` | Vikram Deshmukh | Production & Quality |
| **Purchase Officer** | `purchase` | `purchase123` | Amit Patel | Commercial Procurement |
| **Store Keeper** | `store` | `store123` | Sunil Jadhav | Raw Material Stores |
| **Accountant** | `accounts` | `accounts123` | Pooja Kulkarni | Finance & Taxation |

---

## 3. Database Management API

#### `GET /api/database/stats`
Returns table counts, SQLite database file path, file size, and connection engine.
- **Response `200 OK`**:
```json
{
  "status": "connected",
  "engine": "SQLite 3",
  "databaseFile": ".../backend/data/udyog_erp.db",
  "sizeBytes": 94208,
  "sizeFormatted": "92.0 KB",
  "tables": {
    "users": 5,
    "suppliers": 6,
    "inventory": 12,
    "purchaseOrders": 4,
    "grns": 2,
    "gstInvoices": 3,
    "auditLogs": 3
  }
}
```

#### `POST /api/database/reset`
Resets the SQLite database tables and restores the factory MSME demo dataset.

---

## 3. GST Calculation Rules
When calculating purchase transactions:
1. **Intra-State Supply**: When Supplier State Code equals Company State Code (`27 - Maharashtra`).
   - `CGST Rate = Item GST Rate / 2`
   - `SGST Rate = Item GST Rate / 2`
   - `IGST Rate = 0`
2. **Inter-State Supply**: When Supplier State Code does not equal Company State Code.
   - `IGST Rate = Item GST Rate`
   - `CGST Rate = 0`, `SGST Rate = 0`

---

## 4. API Endpoints Reference

### 4.1 Company Profile
#### `GET /api/company`
Retrieves manufacturing company details, GSTIN, and state registration.
- **Response `200 OK`**:
```json
{
  "name": "Shree Precision Industries Pvt. Ltd.",
  "gstin": "27AABCS1429B1ZB",
  "stateCode": "27",
  "stateName": "Maharashtra",
  "address": "Plot No. E-42, Chakan Industrial Area, Phase-II, MIDC, Pune - 410501",
  "msmeRegNo": "UDYAM-MH-26-0049182",
  "pan": "AABCS1429B"
}
```

---

### 4.2 Inventory Management
#### `GET /api/inventory`
Query Parameters:
- `category` (optional, string): Filter by category (`Raw Materials`, `Fasteners`, etc.)
- `low_stock` (optional, boolean): Set `true` to return only items where `currentStock <= reorderLevel`.

- **Response `200 OK`**:
```json
{
  "count": 12,
  "items": [
    {
      "id": "INV-101",
      "sku": "RM-EN8D-25MM",
      "name": "MS Bright Round Bar EN8D Ø25mm",
      "category": "Raw Materials",
      "hsn": "7214",
      "uom": "Kgs",
      "currentStock": 850.0,
      "reorderLevel": 1000.0,
      "safetyStock": 300.0,
      "unitPrice": 72.00,
      "taxRate": 18.0,
      "preferredSupplierId": "SUP-001",
      "location": "Rack A-01"
    }
  ]
}
```

#### `POST /api/inventory`
Create a new manufacturing stock item.
- **Request Body**:
```json
{
  "sku": "RM-AL6061-50MM",
  "name": "Aluminium 6061-T6 Round Bar Ø50mm",
  "category": "Raw Materials",
  "hsn": "7604",
  "uom": "Kgs",
  "currentStock": 210,
  "reorderLevel": 150,
  "safetyStock": 50,
  "unitPrice": 310.00,
  "taxRate": 18,
  "preferredSupplierId": "SUP-002",
  "location": "Rack A-07"
}
```
- **Response `201 Created`**: Returns created item object.

#### `PUT /api/inventory/{id}`
Update existing item specifications or reorder points.

#### `DELETE /api/inventory/{id}`
Remove item from active inventory catalog.

---

### 4.3 Supplier Management
#### `GET /api/suppliers`
List approved vendor directory.
- **Response `200 OK`**:
```json
{
  "count": 6,
  "suppliers": [
    {
      "id": "SUP-001",
      "name": "Tata Steel Tubes & Rods Depot",
      "gstin": "27AAACT2727Q1ZW",
      "stateCode": "27",
      "stateName": "Maharashtra",
      "contactPerson": "Rajesh Shinde",
      "phone": "9822144556",
      "email": "pune.depot@tatasteel.com",
      "paymentTerms": "Net 30 Days"
    }
  ]
}
```

#### `POST /api/suppliers`
Register new vendor with Indian GSTIN validation.
- **Request Body**:
```json
{
  "name": "Sandvik Coromant Cutting Tools",
  "gstin": "27AAACS4412R1Z3",
  "stateCode": "27",
  "contactPerson": "Sanjay Kulkarni",
  "phone": "9823067890",
  "email": "sanjay.kulkarni@sandvik.com",
  "paymentTerms": "Net 30 Days",
  "address": "Dapodi, Pune - 411012"
}
```

---

### 4.4 Purchase Orders (PO)
#### `GET /api/purchase-orders`
Query Parameters: `status` (`Issued`, `Partially Received`, `Completed`, `Draft`, `Cancelled`).

#### `POST /api/purchase-orders`
Issue a new Purchase Order with dynamic line items and auto-calculated tax breakdown.
- **Request Body**:
```json
{
  "poNumber": "PO/2024-25/0105",
  "poDate": "2024-10-28",
  "expectedDeliveryDate": "2024-11-05",
  "supplierId": "SUP-001",
  "items": [
    {
      "inventoryId": "INV-101",
      "sku": "RM-EN8D-25MM",
      "name": "MS Bright Round Bar EN8D Ø25mm",
      "hsn": "7214",
      "uom": "Kgs",
      "orderQty": 500,
      "unitPrice": 72.00,
      "discountPercent": 0,
      "taxRate": 18,
      "taxableAmount": 36000.00,
      "cgstRate": 9,
      "cgstAmount": 3240.00,
      "sgstRate": 9,
      "sgstAmount": 3240.00,
      "igstRate": 0,
      "igstAmount": 0.00,
      "totalAmount": 42480.00
    }
  ],
  "subtotal": 36000.00,
  "cgstTotal": 3240.00,
  "sgstTotal": 3240.00,
  "igstTotal": 0.00,
  "roundOff": 0.00,
  "grandTotal": 42480.00,
  "notes": "MTC test certificate required with shipment."
}
```

---

### 4.5 Goods Receipt Note (GRN / Inward)
#### `POST /api/grn`
Records receipt and QC inspection of materials. **Atomically increments physical stock for accepted quantities**.
- **Request Body**:
```json
{
  "grnNumber": "GRN/24-25/0090",
  "grnDate": "2024-10-28",
  "poId": "PO-2024-001",
  "challanNumber": "DC-TS-99881",
  "challanDate": "2024-10-27",
  "vehicleNumber": "MH 14 EM 8421",
  "gateEntryNumber": "GE-2024-1190",
  "remarks": "Inspected and accepted.",
  "items": [
    {
      "inventoryId": "INV-101",
      "sku": "RM-EN8D-25MM",
      "receivedQty": 500,
      "acceptedQty": 495,
      "rejectedQty": 5,
      "rejectionReason": "Thread damage on bar ends",
      "batchNumber": "HEAT-24B-91"
    }
  ]
}
```
- **Side Effect**: `INV-101` currentStock automatically increases by `+495.00`.

---

### 4.6 GST Invoices & ITC Summary
#### `GET /api/gst/itc-summary`
Fetches eligible Input Tax Credit summary for statutory GSTR-3B monthly filing.
- **Response `200 OK`**:
```json
{
  "period": "October 2024",
  "totalTaxablePurchases": 129530.00,
  "eligibleITC": {
    "cgst": 6145.20,
    "sgst": 6145.20,
    "igst": 11025.00,
    "totalClaimableCredit": 23315.40
  },
  "gstr2bReconciled": true
}
```
