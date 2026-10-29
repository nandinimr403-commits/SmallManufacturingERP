/**
 * UdyogERP - GST Purchase Records & Tax Invoice Controller
 * Tracks B2B supplier tax invoices, computes CGST/SGST/IGST tax splits, ITC eligibility, and GSTR-2B reconciliation.
 */

const GSTInvoicesModule = {
    searchQuery: "",
    statusFilter: "ALL",
    itcFilter: "ALL",

    init() {
        this.renderTable();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const searchInput = document.getElementById("invoice-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderTable();
            });
        }

        const statusFilter = document.getElementById("invoice-filter-status");
        if (statusFilter) {
            statusFilter.addEventListener("change", (e) => {
                this.statusFilter = e.target.value;
                this.renderTable();
            });
        }

        const itcFilter = document.getElementById("invoice-filter-itc");
        if (itcFilter) {
            itcFilter.addEventListener("change", (e) => {
                this.itcFilter = e.target.value;
                this.renderTable();
            });
        }

        // Live tax computation on modal inputs
        ["inv-taxable", "inv-rate", "inv-supplier"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", () => this.recalculateModalTax());
                el.addEventListener("change", () => this.recalculateModalTax());
            }
        });
    },

    renderTable() {
        const tbody = document.getElementById("invoice-table-body");
        if (!tbody) return;

        let invoices = StorageManager.getGSTInvoices();

        if (this.searchQuery) {
            invoices = invoices.filter(inv =>
                inv.invoiceNumber.toLowerCase().includes(this.searchQuery) ||
                inv.supplierName.toLowerCase().includes(this.searchQuery) ||
                (inv.supplierGstin && inv.supplierGstin.toLowerCase().includes(this.searchQuery))
            );
        }

        if (this.statusFilter !== "ALL") {
            invoices = invoices.filter(inv => inv.paymentStatus === this.statusFilter);
        }

        if (this.itcFilter !== "ALL") {
            invoices = invoices.filter(inv => inv.itcEligibility === this.itcFilter);
        }

        if (invoices.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="table-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        <p>No GST purchase invoices found.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = invoices.map(inv => {
            const isIntra = (inv.taxType === "INTRA_STATE");
            const taxDetail = isIntra ?
                `CGST: ${GSTUtils.formatINR(inv.cgstAmount)} (${inv.cgstRate}%)<br>SGST: ${GSTUtils.formatINR(inv.sgstAmount)} (${inv.sgstRate}%)` :
                `IGST: ${GSTUtils.formatINR(inv.igstAmount)} (${inv.igstRate}%)`;

            const gstr2bClass = inv.gstr2bStatus === "Matched" ? "badge-success" : "badge-warning";
            const itcClass = inv.itcEligibility === "Eligible" ? "badge-info" : "badge-neutral";

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${inv.invoiceNumber}</span>
                        <span class="cell-subtext">Date: ${GSTUtils.formatDate(inv.invoiceDate)}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${inv.supplierName}</span>
                        <span class="cell-subtext font-mono">${inv.supplierGstin} (${inv.supplierStateCode})</span>
                    </td>
                    <td>
                        <span class="cell-subtext">PO: ${inv.poNumber || '—'}</span>
                        <span class="cell-subtext">GRN: ${inv.grnNumber || '—'}</span>
                    </td>
                    <td>
                        <span class="currency">${GSTUtils.formatINR(inv.taxableAmount)}</span>
                    </td>
                    <td>
                        <span style="font-size: 0.78rem; line-height: 1.3; display: block;">${taxDetail}</span>
                    </td>
                    <td>
                        <span class="currency" style="color: var(--primary-light); font-size: 0.95rem;">${GSTUtils.formatINR(inv.totalInvoiceAmount)}</span>
                    </td>
                    <td>
                        <span class="badge ${itcClass}">${inv.itcEligibility}</span>
                        <span class="badge ${gstr2bClass}" style="margin-top: 0.2rem; display: inline-flex;">2B: ${inv.gstr2bStatus}</span>
                    </td>
                    <td class="text-right">
                        <div style="display: inline-flex; gap: 0.35rem;">
                            <button class="btn btn-xs btn-outline" onclick="GSTInvoicesModule.viewInvoice('${inv.id}')">View</button>
                            <button class="btn btn-xs btn-outline" onclick="GSTInvoicesModule.deleteInvoice('${inv.id}')" style="color: var(--danger);">✕</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    },

    openCreateModal() {
        this.resetCreateModal();
        this.populateSuppliers();
        this.populatePOs();
        App.openModal("modal-invoice-create");
    },

    populateSuppliers() {
        const select = document.getElementById("inv-supplier");
        if (!select) return;
        const suppliers = StorageManager.getSuppliers();
        select.innerHTML = '<option value="">-- Select Registered Supplier --</option>' +
            suppliers.map(s => `<option value="${s.id}" data-state="${s.stateCode}">${s.name} (${s.stateName} - ${s.stateCode})</option>`).join("");
    },

    populatePOs() {
        const select = document.getElementById("inv-po");
        if (!select) return;
        const pos = StorageManager.getPurchaseOrders();
        select.innerHTML = '<option value="">-- Link to Purchase Order (Optional) --</option>' +
            pos.map(p => `<option value="${p.id}" data-supplier="${p.supplierId}" data-ponum="${p.poNumber}">${p.poNumber} (${p.supplierName})</option>`).join("");
    },

    handlePOSelection(poId) {
        if (!poId) return;
        const po = StorageManager.getPurchaseOrderById(poId);
        if (!po) return;

        const supplierSelect = document.getElementById("inv-supplier");
        if (supplierSelect) {
            supplierSelect.value = po.supplierId;
        }

        const taxableInput = document.getElementById("inv-taxable");
        if (taxableInput) {
            taxableInput.value = po.subtotal;
        }

        this.recalculateModalTax();
    },

    recalculateModalTax() {
        const supplierSelect = document.getElementById("inv-supplier");
        const supplierId = supplierSelect ? supplierSelect.value : "";
        const supplier = StorageManager.getSupplierById(supplierId);
        const company = StorageManager.getCompany();

        const taxable = parseFloat(document.getElementById("inv-taxable").value) || 0;
        const rate = parseFloat(document.getElementById("inv-rate").value) || 18;

        const supplierStateCode = supplier ? supplier.stateCode : company.stateCode;
        const isIntra = (supplierStateCode === company.stateCode);

        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;

        if (isIntra) {
            const halfRate = rate / 2;
            cgstAmount = GSTUtils.round2((taxable * halfRate) / 100);
            sgstAmount = GSTUtils.round2((taxable * halfRate) / 100);
        } else {
            igstAmount = GSTUtils.round2((taxable * rate) / 100);
        }

        const totalTax = cgstAmount + sgstAmount + igstAmount;
        const total = Math.round(taxable + totalTax);

        const breakdown = document.getElementById("inv-tax-breakdown-display");
        if (breakdown) {
            if (isIntra) {
                breakdown.innerHTML = `
                    <div style="font-size: 0.8rem; background: var(--bg-main); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
                        <p style="color: var(--primary-light); font-weight: 600; margin-bottom: 0.25rem;">Intra-State Purchase (State Code ${supplierStateCode}):</p>
                        <p>CGST (${rate / 2}%): <strong>${GSTUtils.formatINR(cgstAmount)}</strong></p>
                        <p>SGST (${rate / 2}%): <strong>${GSTUtils.formatINR(sgstAmount)}</strong></p>
                        <p style="margin-top: 0.35rem; font-weight: 700;">Grand Total: <span style="color: #1e3a8a;">${GSTUtils.formatINR(total)}</span></p>
                    </div>
                `;
            } else {
                breakdown.innerHTML = `
                    <div style="font-size: 0.8rem; background: var(--bg-main); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
                        <p style="color: #7c3aed; font-weight: 600; margin-bottom: 0.25rem;">Inter-State Purchase (State Code ${supplierStateCode}):</p>
                        <p>IGST (${rate}%): <strong>${GSTUtils.formatINR(igstAmount)}</strong></p>
                        <p style="margin-top: 0.35rem; font-weight: 700;">Grand Total: <span style="color: #1e3a8a;">${GSTUtils.formatINR(total)}</span></p>
                    </div>
                `;
            }
        }
    },

    resetCreateModal() {
        const form = document.getElementById("form-invoice-create");
        if (form) form.reset();
        const dateInput = document.getElementById("inv-date");
        if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];
        const dueDateInput = document.getElementById("inv-due-date");
        if (dueDateInput) {
            const d = new Date();
            d.setDate(d.getDate() + 30);
            dueDateInput.value = d.toISOString().split("T")[0];
        }
        this.recalculateModalTax();
    },

    saveInvoice() {
        const invoiceNumber = document.getElementById("inv-number").value.trim();
        const invoiceDate = document.getElementById("inv-date").value;
        const dueDate = document.getElementById("inv-due-date").value;
        const supplierId = document.getElementById("inv-supplier").value;
        const poId = document.getElementById("inv-po").value;
        const taxable = parseFloat(document.getElementById("inv-taxable").value) || 0;
        const rate = parseFloat(document.getElementById("inv-rate").value) || 18;
        const hsn = document.getElementById("inv-hsn").value.trim();
        const itcEligibility = document.getElementById("inv-itc-eligibility").value;
        const paymentStatus = document.getElementById("inv-payment-status").value;

        if (!invoiceNumber) {
            App.showToast("Validation Error", "Supplier Invoice Number is required.", "danger");
            return;
        }

        if (!supplierId) {
            App.showToast("Validation Error", "Please select a supplier.", "danger");
            return;
        }

        if (taxable <= 0) {
            App.showToast("Validation Error", "Taxable amount must be greater than zero.", "danger");
            return;
        }

        const supplier = StorageManager.getSupplierById(supplierId);
        const company = StorageManager.getCompany();
        const isIntra = (supplier.stateCode === company.stateCode);

        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        let cgstRate = 0;
        let sgstRate = 0;
        let igstRate = 0;

        if (isIntra) {
            cgstRate = rate / 2;
            sgstRate = rate / 2;
            cgstAmount = GSTUtils.round2((taxable * cgstRate) / 100);
            sgstAmount = GSTUtils.round2((taxable * sgstRate) / 100);
        } else {
            igstRate = rate;
            igstAmount = GSTUtils.round2((taxable * rate) / 100);
        }

        const totalTax = cgstAmount + sgstAmount + igstAmount;
        const unrounded = taxable + totalTax;
        const grandTotal = Math.round(unrounded);
        const roundOff = GSTUtils.round2(grandTotal - unrounded);

        const po = StorageManager.getPurchaseOrderById(poId);

        const invoiceData = {
            id: `INV-REC-${Date.now().toString().slice(-4)}`,
            invoiceNumber,
            invoiceDate,
            dueDate,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierGstin: supplier.gstin,
            supplierStateCode: supplier.stateCode,
            poNumber: po ? po.poNumber : "Direct Purchase",
            grnNumber: "Direct Receipt",
            taxableAmount: taxable,
            taxType: isIntra ? "INTRA_STATE" : "INTER_STATE",
            cgstRate,
            cgstAmount,
            sgstRate,
            sgstAmount,
            igstRate,
            igstAmount,
            roundOff,
            totalInvoiceAmount: grandTotal,
            itcEligibility,
            itcClaimed: (itcEligibility === "Eligible"),
            gstr2bStatus: "Matched",
            paymentStatus,
            createdBy: (window.AuthManager && AuthManager.getCurrentUser()) ? AuthManager.getCurrentUser().fullName : "Pooja Kulkarni",
            hsnSummary: [
                { hsn: hsn || "7214", taxable, rate, cgst: cgstAmount, sgst: sgstAmount, igst: igstAmount }
            ]
        };

        StorageManager.saveGSTInvoice(invoiceData);
        App.closeModal("modal-invoice-create");
        App.showToast("Recorded", `Tax Invoice ${invoiceNumber} saved to GST Purchase Register.`, "success");
        this.renderTable();
    },

    deleteInvoice(id) {
        if (confirm("Are you sure you want to delete this GST invoice record?")) {
            StorageManager.deleteGSTInvoice(id);
            App.showToast("Deleted", "GST invoice removed.", "info");
            this.renderTable();
        }
    },

    viewInvoice(id) {
        const inv = StorageManager.getGSTInvoiceById(id);
        if (!inv) return;

        const company = StorageManager.getCompany();
        const modalBody = document.getElementById("modal-invoice-view-content");
        if (!modalBody) return;

        const isIntra = (inv.taxType === "INTRA_STATE");

        modalBody.innerHTML = `
            <div class="printable-document">
                <div class="print-header" style="border-bottom: 2px solid #2563eb; padding-bottom: 0.8rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between;">
                    <div>
                        <h2 style="color: #2563eb; font-size: 1.25rem;">GST PURCHASE VOUCHER</h2>
                        <p style="font-size: 0.8rem; color: #475569;">Company: <strong>${company.name}</strong></p>
                        <p style="font-size: 0.8rem; color: #475569;">GSTIN: <strong>${company.gstin}</strong> (State: ${company.stateName} - ${company.stateCode})</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge ${inv.itcEligibility === 'Eligible' ? 'badge-success' : 'badge-danger'}">ITC: ${inv.itcEligibility}</span>
                        <p style="font-family: monospace; font-weight: 700; margin: 0.3rem 0;">Inv No: ${inv.invoiceNumber}</p>
                        <p style="font-size: 0.8rem; color: #64748b;">Date: ${GSTUtils.formatDate(inv.invoiceDate)}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; font-size: 0.85rem; background: #f8fafc; padding: 1rem; border-radius: 6px;">
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block;">SUPPLIER DETAILS</span>
                        <strong>${inv.supplierName}</strong>
                        <p style="margin: 0.15rem 0; font-family: monospace;">GSTIN: ${inv.supplierGstin}</p>
                        <p style="margin: 0.15rem 0;">State: ${GST_STATE_CODES[inv.supplierStateCode] || inv.supplierStateCode} (${inv.supplierStateCode})</p>
                    </div>
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block;">AUDIT & GST COMPLIANCE</span>
                        <p style="margin: 0.15rem 0;">Supply Nature: <strong>${isIntra ? 'Intra-State Supply (Sec 8 CGST Act)' : 'Inter-State Supply (Sec 7 IGST Act)'}</strong></p>
                        <p style="margin: 0.15rem 0;">GSTR-2B Auto-Reconciliation: <strong style="color: var(--success);">${inv.gstr2bStatus}</strong></p>
                        <p style="margin: 0.15rem 0;">Payment Due Date: ${GSTUtils.formatDate(inv.dueDate)} (<span style="color: ${inv.paymentStatus === 'Paid' ? 'var(--success)' : 'var(--warning-text)'}">${inv.paymentStatus}</span>)</p>
                    </div>
                </div>

                <table class="data-table" style="width: 100%; margin-bottom: 1.5rem; border: 1px solid #e2e8f0;">
                    <thead>
                        <tr>
                            <th>HSN / SAC</th>
                            <th class="text-right">Taxable Value (₹)</th>
                            <th class="text-right">CGST</th>
                            <th class="text-right">SGST</th>
                            <th class="text-right">IGST</th>
                            <th class="text-right">Total Invoice Value (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="font-mono">${inv.hsnSummary ? inv.hsnSummary[0].hsn : '7214'}</span></td>
                            <td class="text-right font-mono">${GSTUtils.formatINR(inv.taxableAmount)}</td>
                            <td class="text-right font-mono">${isIntra ? `${GSTUtils.formatINR(inv.cgstAmount)} (${inv.cgstRate}%)` : '—'}</td>
                            <td class="text-right font-mono">${isIntra ? `${GSTUtils.formatINR(inv.sgstAmount)} (${inv.sgstRate}%)` : '—'}</td>
                            <td class="text-right font-mono">${!isIntra ? `${GSTUtils.formatINR(inv.igstAmount)} (${inv.igstRate}%)` : '—'}</td>
                            <td class="text-right font-mono" style="font-weight: 700; color: #1e3a8a;">${GSTUtils.formatINR(inv.totalInvoiceAmount)}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="display: flex; justify-content: flex-end; margin-bottom: 1.5rem;">
                    <div style="width: 280px; font-size: 0.85rem; border-top: 1px solid #e2e8f0; padding-top: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.2rem 0;">
                            <span>Total Taxable:</span>
                            <strong>${GSTUtils.formatINR(inv.taxableAmount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.2rem 0;">
                            <span>Total GST Tax:</span>
                            <strong>${GSTUtils.formatINR((inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0))}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.4rem 0; font-size: 1rem; font-weight: 700; border-top: 2px solid #0f172a; margin-top: 0.2rem;">
                            <span>Invoice Total:</span>
                            <span style="color: #1e3a8a;">${GSTUtils.formatINR(inv.totalInvoiceAmount)}</span>
                        </div>
                    </div>
                </div>

                <div style="font-size: 0.78rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 0.8rem;">
                    * Certified that the particulars furnished above are true and correct. Input Tax Credit is availed in compliance with Section 16(2) of the CGST Act 2017.
                </div>
            </div>
        `;

        App.openModal("modal-invoice-view");
    }
};
