# UdyogERP - User Guide & Workflow Manual

**UdyogERP** is specifically designed for Indian micro, small, and medium enterprises (MSMEs) in precision machining, fabrication, engineering, and manufacturing.

---

## 1. Core Manufacturing Workflows

### 1.1 Managing Raw Material Inventory
1. Click **Inventory Master** in the left sidebar.
2. Browse preloaded materials:
   - Bright round bars (EN8D, SS304, Aluminium 6061)
   - High tensile fasteners (Grade 8.8 bolts, Nyloc nuts)
   - Tooling & inserts (CNMG carbide turning inserts)
   - Industrial lubricants (Servo Cut S cutting coolant, Hydraulic ISO 68)
3. Filter by category or search by SKU/HSN code.
4. Items with stock $\le$ reorder level are highlighted with an amber **Low Stock** badge; out-of-stock items show a red **Out of Stock** badge.
5. Click **+ Add New Item** to add custom items with HSN codes (4 to 8 digits) and GST tax rates (5%, 12%, 18%, 28%).

---

### 1.2 Supplier Management & GSTIN Verification
1. Click **Supplier Directory** in the sidebar.
2. Click **Register Supplier**.
3. Type in the supplier's 15-character GSTIN (e.g. `27AAACT2727Q1ZW`).
4. **Automatic Detection**:
   - The system validates the GSTIN format using statutory regex.
   - Extracts the 2-digit State Code (e.g., `27` -> Maharashtra, `24` -> Gujarat).
   - Automatically determines whether the supplier is **Intra-State** (CGST + SGST) or **Inter-State** (IGST) relative to your manufacturing plant.

---

### 1.3 Creating Purchase Orders (Dynamic PO Builder)
1. Click **Purchase Orders** $\rightarrow$ **Create Purchase Order** (or click **Raise PO** directly from any low-stock alert).
2. Select your approved supplier.
3. Add line items:
   - Select the material from inventory; the system auto-fills the SKU, HSN code, UOM, unit price, and GST rate.
   - Enter ordered quantity and any commercial discount %.
4. **Live Tax Computation Engine**:
   - If Supplier is in Maharashtra (Code 27): Splitting into **CGST (9%) + SGST (9%)**.
   - If Supplier is in Gujarat/Haryana (Code 24/06): Applied as **IGST (18%)**.
   - Live Subtotal, GST taxes, Round-off, and Grand Total update instantaneously!
5. Click **Issue Purchase Order**.
6. Click **View / Print** on any PO to preview or print an official, letterhead-formatted purchase order voucher.

---

### 1.4 Goods Receipt Note (GRN) & Real-time Stock Sync
1. When materials arrive at the factory gate, click **Receive Goods** (or open **Goods Receipt (GRN)**).
2. Select the pending Purchase Order. The system loads ordered vs pending quantities.
3. Enter delivery challan number, vehicle number, and gate entry number.
4. Input:
   - **Received Qty**
   - **Accepted Qty** (e.g., passed dimensional/hardness check)
   - **Rejected Qty** (and optional rejection reason)
   - **Batch / Heat No.** (vital for material test trace)
5. Click **Approve & Update Inventory Stock**.
6. **Automatic Sync**: The accepted quantity is immediately added to the physical stock balance in the Inventory Master, and any low-stock warning for that item clears instantly!

---

### 1.5 GST Purchase Register & Input Tax Credit (ITC)
1. Navigate to **GST Purchase Register**.
2. Click **Record Tax Invoice**.
3. Enter the vendor's invoice number, date, and link to the PO.
4. Set ITC Eligibility: **Eligible** (business procurement) or **Ineligible** (Section 17(5) blocked credit).
5. The invoice reflects in the GSTR-2B reconciliation view and monthly GSTR-3B tax credit summary.

---

### 1.6 Purchase Reports & CSV Export
1. Click **Purchase Reports** to view:
   - **Supplier Spend Report**: Vendor-wise turnover and taxes paid.
   - **HSN-wise GST Tax Summary**: Grouped by HSN codes for annual GSTR-9 audits.
   - **Low-Stock Audit**: Deficit list with estimated replenishment costs.
   - **GSTR-3B ITC Summary**: Table 4A eligible tax credit split.
2. Click **Export CSV** to download ready-to-import spreadsheets for Excel or Tally ERP!
