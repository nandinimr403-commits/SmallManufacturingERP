/**
 * UdyogERP - Purchase Orders Controller
 * Handles dynamic line-item builder, intra/inter-state GST calculation, PO issuance, and printable tax order vouchers.
 */

const PurchaseOrdersModule = {
    searchQuery: "",
    statusFilter: "ALL",
    currentPOItems: [],

    init() {
        this.renderTable();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const searchInput = document.getElementById("po-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderTable();
            });
        }

        const statusFilter = document.getElementById("po-filter-status");
        if (statusFilter) {
            statusFilter.addEventListener("change", (e) => {
                this.statusFilter = e.target.value;
                this.renderTable();
            });
        }

        const supplierSelect = document.getElementById("po-supplier");
        if (supplierSelect) {
            supplierSelect.addEventListener("change", () => {
                this.updateGSTTaxDisplay();
            });
        }
    },

    renderTable() {
        const tbody = document.getElementById("po-table-body");
        if (!tbody) return;

        let pos = StorageManager.getPurchaseOrders();

        if (this.searchQuery) {
            pos = pos.filter(p =>
                p.poNumber.toLowerCase().includes(this.searchQuery) ||
                p.supplierName.toLowerCase().includes(this.searchQuery)
            );
        }

        if (this.statusFilter !== "ALL") {
            pos = pos.filter(p => p.status === this.statusFilter);
        }

        if (pos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <p>No purchase orders found matching current filter.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pos.map(po => {
            let statusBadge = "badge-neutral";
            if (po.status === "Completed") statusBadge = "badge-success";
            else if (po.status === "Partially Received") statusBadge = "badge-info";
            else if (po.status === "Issued") statusBadge = "badge-warning";
            else if (po.status === "Cancelled") statusBadge = "badge-danger";

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${po.poNumber}</span>
                        <span class="cell-subtext">Order Date: ${GSTUtils.formatDate(po.poDate)}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${po.supplierName}</span>
                        <span class="cell-subtext">GSTIN: ${po.supplierGstin || '—'}</span>
                    </td>
                    <td>
                        <span class="cell-subtext" style="color: var(--text-primary);">${GSTUtils.formatDate(po.expectedDeliveryDate)}</span>
                    </td>
                    <td>
                        <span class="currency">${GSTUtils.formatINR(po.grandTotal)}</span>
                        <span class="cell-subtext">${po.items.length} line item(s)</span>
                    </td>
                    <td>
                        <span class="badge ${statusBadge}">
                            <span class="badge-dot"></span>
                            ${po.status}
                        </span>
                    </td>
                    <td class="text-right">
                        <div style="display: inline-flex; gap: 0.35rem;">
                            <button class="btn btn-xs btn-outline" title="View & Print PO" onclick="PurchaseOrdersModule.viewPurchaseOrder('${po.id}')">
                                View / Print
                            </button>
                            ${(po.status === "Issued" || po.status === "Partially Received") ? `
                                <button class="btn btn-xs btn-primary" title="Inward Receipt (GRN)" onclick="GRNModule.openCreateModalForPO('${po.id}')">
                                    Receive
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    },

    openCreateModal() {
        this.resetCreateModal();
        this.populateSuppliersDropdown();
        this.generateNextPONumber();
        this.addLineItem(); // Start with 1 empty row
        App.openModal("modal-po-create");
    },

    openCreateModalWithItem(inventoryId, suggestedQty = 1) {
        this.openCreateModal();
        const item = StorageManager.getInventoryById(inventoryId);
        if (!item) return;

        // Auto-select supplier if preferred
        if (item.preferredSupplierId) {
            const supplierSelect = document.getElementById("po-supplier");
            if (supplierSelect) {
                supplierSelect.value = item.preferredSupplierId;
                this.updateGSTTaxDisplay();
            }
        }

        // Set line item 0 to this item
        setTimeout(() => {
            const itemSelect = document.querySelector(".po-line-item-select");
            const qtyInput = document.querySelector(".po-line-item-qty");
            if (itemSelect) {
                itemSelect.value = inventoryId;
                this.handleLineItemChange(0, inventoryId);
            }
            if (qtyInput) {
                qtyInput.value = suggestedQty;
                this.recalculateAllLineItems();
            }
        }, 50);

        App.showToast("PO Started", `Pre-filled item ${item.name} with suggested shortage ${suggestedQty} ${item.uom}`, "info");
    },

    populateSuppliersDropdown() {
        const select = document.getElementById("po-supplier");
        if (!select) return;
        const suppliers = StorageManager.getSuppliers();
        select.innerHTML = '<option value="">-- Select Supplier --</option>' +
            suppliers.map(s => `<option value="${s.id}" data-state="${s.stateCode}">${s.name} (${s.stateName} - ${s.stateCode})</option>`).join("");
    },

    generateNextPONumber() {
        const pos = StorageManager.getPurchaseOrders();
        const nextNum = (pos.length + 1).toString().padStart(4, '0');
        const input = document.getElementById("po-number");
        if (input) input.value = `PO/2024-25/${nextNum}`;

        const dateInput = document.getElementById("po-date");
        if (dateInput) {
            const today = new Date().toISOString().split("T")[0];
            dateInput.value = today;
        }

        const deliveryDateInput = document.getElementById("po-delivery-date");
        if (deliveryDateInput) {
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            deliveryDateInput.value = nextWeek.toISOString().split("T")[0];
        }
    },

    resetCreateModal() {
        this.currentPOItems = [];
        const tbody = document.getElementById("po-line-items-tbody");
        if (tbody) tbody.innerHTML = "";
        const notesInput = document.getElementById("po-notes");
        if (notesInput) notesInput.value = "Material must be accompanied by GST invoice and Test Certificate.";
        this.updateGSTTaxDisplay();
    },

    addLineItem() {
        const inventory = StorageManager.getInventory();
        const index = this.currentPOItems.length;

        this.currentPOItems.push({
            inventoryId: "",
            sku: "",
            name: "",
            hsn: "",
            uom: "Nos",
            orderQty: 1,
            unitPrice: 0,
            discountPercent: 0,
            taxRate: 18,
            taxableAmount: 0,
            cgstRate: 0,
            cgstAmount: 0,
            sgstRate: 0,
            sgstAmount: 0,
            igstRate: 0,
            igstAmount: 0,
            totalAmount: 0,
            receivedQty: 0
        });

        const tbody = document.getElementById("po-line-items-tbody");
        if (!tbody) return;

        const tr = document.createElement("tr");
        tr.id = `po-row-${index}`;
        tr.innerHTML = `
            <td style="min-width: 200px;">
                <select class="form-control po-line-item-select" onchange="PurchaseOrdersModule.handleLineItemChange(${index}, this.value)">
                    <option value="">-- Select Material / Item --</option>
                    ${inventory.map(item => `<option value="${item.id}">${item.sku} - ${item.name}</option>`).join("")}
                </select>
                <div class="cell-subtext po-row-meta" id="po-meta-${index}">—</div>
            </td>
            <td style="width: 100px;">
                <input type="number" class="form-control po-line-item-qty" min="0.01" step="any" value="1" oninput="PurchaseOrdersModule.handleQtyPriceChange(${index})">
            </td>
            <td style="width: 120px;">
                <input type="number" class="form-control po-line-item-price" min="0" step="any" value="0.00" oninput="PurchaseOrdersModule.handleQtyPriceChange(${index})">
            </td>
            <td style="width: 80px;">
                <input type="number" class="form-control po-line-item-disc" min="0" max="100" step="any" value="0" oninput="PurchaseOrdersModule.handleQtyPriceChange(${index})">
            </td>
            <td class="text-right" style="width: 110px;">
                <span class="currency" id="po-taxable-${index}">₹ 0.00</span>
            </td>
            <td class="text-right" style="width: 110px;">
                <span class="currency" id="po-total-${index}">₹ 0.00</span>
            </td>
            <td class="text-center" style="width: 45px;">
                <button type="button" class="btn btn-xs btn-outline" style="color: var(--danger);" onclick="PurchaseOrdersModule.removeLineItem(${index})">✕</button>
            </td>
        `;

        tbody.appendChild(tr);
        this.recalculateAllLineItems();
    },

    removeLineItem(index) {
        if (this.currentPOItems.length <= 1) {
            App.showToast("Notice", "PO must have at least one line item.", "warning");
            return;
        }
        this.currentPOItems.splice(index, 1);
        this.refreshLineItemsTableDOM();
    },

    refreshLineItemsTableDOM() {
        const tbody = document.getElementById("po-line-items-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const savedItems = [...this.currentPOItems];
        this.currentPOItems = [];

        savedItems.forEach((item, idx) => {
            this.addLineItem();
            const tr = document.getElementById(`po-row-${idx}`);
            if (tr) {
                const sel = tr.querySelector(".po-line-item-select");
                const qty = tr.querySelector(".po-line-item-qty");
                const prc = tr.querySelector(".po-line-item-price");
                const disc = tr.querySelector(".po-line-item-disc");

                if (sel) sel.value = item.inventoryId;
                if (qty) qty.value = item.orderQty;
                if (prc) prc.value = item.unitPrice;
                if (disc) disc.value = item.discountPercent;

                this.handleLineItemChange(idx, item.inventoryId, false);
            }
        });

        this.recalculateAllLineItems();
    },

    handleLineItemChange(index, inventoryId, triggerRecalc = true) {
        const item = StorageManager.getInventoryById(inventoryId);
        const metaEl = document.getElementById(`po-meta-${index}`);
        const tr = document.getElementById(`po-row-${index}`);
        if (!tr) return;

        const priceInput = tr.querySelector(".po-line-item-price");

        if (item) {
            this.currentPOItems[index].inventoryId = item.id;
            this.currentPOItems[index].sku = item.sku;
            this.currentPOItems[index].name = item.name;
            this.currentPOItems[index].hsn = item.hsn;
            this.currentPOItems[index].uom = item.uom;
            this.currentPOItems[index].unitPrice = item.unitPrice;
            this.currentPOItems[index].taxRate = item.taxRate;

            if (priceInput && triggerRecalc) priceInput.value = item.unitPrice;
            if (metaEl) metaEl.textContent = `HSN: ${item.hsn} | UOM: ${item.uom} | GST: ${item.taxRate}%`;
        } else {
            this.currentPOItems[index].inventoryId = "";
            if (metaEl) metaEl.textContent = "—";
        }

        if (triggerRecalc) this.recalculateAllLineItems();
    },

    handleQtyPriceChange(index) {
        const tr = document.getElementById(`po-row-${index}`);
        if (!tr) return;

        const qty = parseFloat(tr.querySelector(".po-line-item-qty").value) || 0;
        const price = parseFloat(tr.querySelector(".po-line-item-price").value) || 0;
        const disc = parseFloat(tr.querySelector(".po-line-item-disc").value) || 0;

        this.currentPOItems[index].orderQty = qty;
        this.currentPOItems[index].unitPrice = price;
        this.currentPOItems[index].discountPercent = disc;

        this.recalculateAllLineItems();
    },

    recalculateAllLineItems() {
        const supplierSelect = document.getElementById("po-supplier");
        const supplierId = supplierSelect ? supplierSelect.value : "";
        const supplier = StorageManager.getSupplierById(supplierId);
        const company = StorageManager.getCompany();

        const supplierStateCode = supplier ? supplier.stateCode : company.stateCode;
        const taxType = GSTUtils.getTaxType(supplierStateCode, company.stateCode);

        this.currentPOItems.forEach((item, index) => {
            const lineTax = GSTUtils.calculateLineItemTax(
                item.orderQty,
                item.unitPrice,
                item.discountPercent,
                item.taxRate,
                taxType
            );

            item.taxableAmount = lineTax.taxableAmount;
            item.cgstRate = lineTax.cgstRate;
            item.cgstAmount = lineTax.cgstAmount;
            item.sgstRate = lineTax.sgstRate;
            item.sgstAmount = lineTax.sgstAmount;
            item.igstRate = lineTax.igstRate;
            item.igstAmount = lineTax.igstAmount;
            item.totalAmount = lineTax.lineTotal;

            const taxableEl = document.getElementById(`po-taxable-${index}`);
            const totalEl = document.getElementById(`po-total-${index}`);
            if (taxableEl) taxableEl.textContent = GSTUtils.formatINR(lineTax.taxableAmount);
            if (totalEl) totalEl.textContent = GSTUtils.formatINR(lineTax.lineTotal);
        });

        this.updateTaxSummaryBox(taxType);
    },

    updateGSTTaxDisplay() {
        const supplierSelect = document.getElementById("po-supplier");
        const supplierId = supplierSelect ? supplierSelect.value : "";
        const supplier = StorageManager.getSupplierById(supplierId);
        const company = StorageManager.getCompany();
        const badgeContainer = document.getElementById("po-tax-indicator");

        if (!badgeContainer) return;

        if (supplier) {
            const isIntra = (supplier.stateCode === company.stateCode);
            badgeContainer.innerHTML = isIntra ? 
                `<span class="badge badge-info">Intra-State Supply (CGST + SGST applied) • Supplier in ${supplier.stateName} (${supplier.stateCode})</span>` :
                `<span class="badge badge-warning">Inter-State Supply (IGST applied) • Supplier in ${supplier.stateName} (${supplier.stateCode})</span>`;
        } else {
            badgeContainer.innerHTML = `<span class="form-helper">Select a supplier to determine GST applicability</span>`;
        }

        this.recalculateAllLineItems();
    },

    updateTaxSummaryBox(taxType) {
        const totals = GSTUtils.computeDocumentTotals(this.currentPOItems);

        const elSubtotal = document.getElementById("po-summary-subtotal");
        const elCgstRow = document.getElementById("po-summary-cgst-row");
        const elCgstVal = document.getElementById("po-summary-cgst");
        const elSgstRow = document.getElementById("po-summary-sgst-row");
        const elSgstVal = document.getElementById("po-summary-sgst");
        const elIgstRow = document.getElementById("po-summary-igst-row");
        const elIgstVal = document.getElementById("po-summary-igst");
        const elRoundOff = document.getElementById("po-summary-roundoff");
        const elGrandTotal = document.getElementById("po-summary-grandtotal");

        if (elSubtotal) elSubtotal.textContent = GSTUtils.formatINR(totals.subtotal);

        if (taxType === "INTRA_STATE") {
            if (elCgstRow) elCgstRow.style.display = "flex";
            if (elCgstVal) elCgstVal.textContent = GSTUtils.formatINR(totals.cgstTotal);
            if (elSgstRow) elSgstRow.style.display = "flex";
            if (elSgstVal) elSgstVal.textContent = GSTUtils.formatINR(totals.sgstTotal);
            if (elIgstRow) elIgstRow.style.display = "none";
        } else {
            if (elCgstRow) elCgstRow.style.display = "none";
            if (elSgstRow) elSgstRow.style.display = "none";
            if (elIgstRow) elIgstRow.style.display = "flex";
            if (elIgstVal) elIgstVal.textContent = GSTUtils.formatINR(totals.igstTotal);
        }

        if (elRoundOff) elRoundOff.textContent = GSTUtils.formatINR(totals.roundOff);
        if (elGrandTotal) elGrandTotal.textContent = GSTUtils.formatINR(totals.grandTotal);
    },

    savePurchaseOrder(status = "Issued") {
        const poNumber = document.getElementById("po-number").value.trim();
        const poDate = document.getElementById("po-date").value;
        const deliveryDate = document.getElementById("po-delivery-date").value;
        const supplierId = document.getElementById("po-supplier").value;
        const notes = document.getElementById("po-notes").value.trim();

        if (!poNumber) {
            App.showToast("Validation Error", "PO Number is required.", "danger");
            return;
        }

        if (!supplierId) {
            App.showToast("Validation Error", "Please select a registered supplier.", "danger");
            return;
        }

        const supplier = StorageManager.getSupplierById(supplierId);
        if (!supplier) return;

        // Check valid line items
        const validItems = this.currentPOItems.filter(i => i.inventoryId && Number(i.orderQty) > 0);
        if (validItems.length === 0) {
            App.showToast("Validation Error", "PO must have at least one valid item with positive quantity.", "danger");
            return;
        }

        const totals = GSTUtils.computeDocumentTotals(validItems);

        const poData = {
            id: `PO-${Date.now().toString().slice(-4)}`,
            poNumber,
            poDate,
            expectedDeliveryDate: deliveryDate,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierGstin: supplier.gstin,
            supplierStateCode: supplier.stateCode,
            status,
            items: validItems,
            subtotal: totals.subtotal,
            cgstTotal: totals.cgstTotal,
            sgstTotal: totals.sgstTotal,
            igstTotal: totals.igstTotal,
            roundOff: totals.roundOff,
            grandTotal: totals.grandTotal,
            notes,
            paymentTerms: supplier.paymentTerms || "Net 30 Days",
            createdBy: (window.AuthManager && AuthManager.getCurrentUser()) ? AuthManager.getCurrentUser().fullName : "Amit Patel"
        };

        StorageManager.savePurchaseOrder(poData);
        App.closeModal("modal-po-create");
        App.showToast("Success", `Purchase Order ${poNumber} created with status '${status}'.`, "success");
        this.renderTable();
    },

    viewPurchaseOrder(id) {
        const po = StorageManager.getPurchaseOrderById(id);
        if (!po) return;

        const company = StorageManager.getCompany();
        const supplier = StorageManager.getSupplierById(po.supplierId) || {
            name: po.supplierName,
            gstin: po.supplierGstin,
            stateName: GST_STATE_CODES[po.supplierStateCode] || "",
            address: "",
            phone: ""
        };

        const modalBody = document.getElementById("modal-po-view-content");
        if (!modalBody) return;

        const isIntra = (po.supplierStateCode === company.stateCode);

        modalBody.innerHTML = `
            <div class="printable-document" id="printable-po">
                <div class="print-header" style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <h2 style="color: #1e3a8a; font-size: 1.3rem; margin-bottom: 0.2rem;">${company.name}</h2>
                        <p style="font-size: 0.8rem; color: #475569; max-width: 450px;">${company.address}</p>
                        <p style="font-size: 0.8rem; color: #475569;">
                            <strong>GSTIN:</strong> ${company.gstin} | <strong>MSME Reg:</strong> ${company.msmeRegNo}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <span style="display: inline-block; padding: 0.35rem 0.85rem; background: #1e3a8a; color: white; font-weight: 700; border-radius: 4px; font-size: 0.85rem; margin-bottom: 0.5rem;">PURCHASE ORDER</span>
                        <p style="font-family: monospace; font-size: 1.05rem; font-weight: 700; margin: 0;">${po.poNumber}</p>
                        <p style="font-size: 0.8rem; color: #64748b;">Date: ${GSTUtils.formatDate(po.poDate)}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; font-size: 0.85rem;">
                    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.9rem;">
                        <strong style="color: #1e3a8a; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; display: block; margin-bottom: 0.4rem;">Vendor / Supplier</strong>
                        <p style="font-weight: 700; font-size: 0.95rem; margin: 0;">${supplier.name}</p>
                        <p style="margin: 0.2rem 0; color: #475569;">${supplier.address || ''}</p>
                        <p style="margin: 0; font-family: monospace;">GSTIN: <strong>${supplier.gstin}</strong></p>
                        <p style="margin: 0.2rem 0; color: #475569;">State: ${supplier.stateName} (Code: ${po.supplierStateCode})</p>
                    </div>
                    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.9rem;">
                        <strong style="color: #1e3a8a; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; display: block; margin-bottom: 0.4rem;">Order & Delivery Details</strong>
                        <p style="margin: 0.2rem 0;">Expected Delivery: <strong>${GSTUtils.formatDate(po.expectedDeliveryDate)}</strong></p>
                        <p style="margin: 0.2rem 0;">Payment Terms: <strong>${po.paymentTerms}</strong></p>
                        <p style="margin: 0.2rem 0;">Status: <span class="badge ${po.status === 'Completed' ? 'badge-success' : 'badge-warning'}">${po.status}</span></p>
                        <p style="margin: 0.2rem 0;">Tax Applicability: <strong>${isIntra ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}</strong></p>
                    </div>
                </div>

                <table class="data-table" style="width: 100%; margin-bottom: 1.5rem; border: 1px solid #e2e8f0;">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Description</th>
                            <th>HSN</th>
                            <th class="text-right">Qty</th>
                            <th class="text-right">Rate</th>
                            <th class="text-right">Taxable</th>
                            <th class="text-right">${isIntra ? 'CGST' : 'IGST'}</th>
                            ${isIntra ? '<th class="text-right">SGST</th>' : ''}
                            <th class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${po.items.map((item, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td>
                                    <strong>${item.name}</strong>
                                    <span style="font-size: 0.72rem; color: #64748b; display: block;">SKU: ${item.sku}</span>
                                </td>
                                <td>${item.hsn}</td>
                                <td class="text-right">${item.orderQty} ${item.uom}</td>
                                <td class="text-right">${GSTUtils.formatINR(item.unitPrice)}</td>
                                <td class="text-right">${GSTUtils.formatINR(item.taxableAmount)}</td>
                                ${isIntra ? `
                                    <td class="text-right">${GSTUtils.formatINR(item.cgstAmount)} <span style="font-size: 0.7rem; color: #64748b;">(${item.cgstRate}%)</span></td>
                                    <td class="text-right">${GSTUtils.formatINR(item.sgstAmount)} <span style="font-size: 0.7rem; color: #64748b;">(${item.sgstRate}%)</span></td>
                                ` : `
                                    <td class="text-right">${GSTUtils.formatINR(item.igstAmount)} <span style="font-size: 0.7rem; color: #64748b;">(${item.igstRate}%)</span></td>
                                `}
                                <td class="text-right font-mono" style="font-weight: 700;">${GSTUtils.formatINR(item.totalAmount)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>

                <div style="display: flex; justify-content: flex-end; margin-bottom: 2rem;">
                    <div style="width: 320px; font-size: 0.85rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
                            <span>Taxable Subtotal:</span>
                            <strong>${GSTUtils.formatINR(po.subtotal)}</strong>
                        </div>
                        ${isIntra ? `
                            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
                                <span>Central GST (CGST):</span>
                                <strong>${GSTUtils.formatINR(po.cgstTotal)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
                                <span>State GST (SGST):</span>
                                <strong>${GSTUtils.formatINR(po.sgstTotal)}</strong>
                            </div>
                        ` : `
                            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
                                <span>Integrated GST (IGST):</span>
                                <strong>${GSTUtils.formatINR(po.igstTotal)}</strong>
                            </div>
                        `}
                        <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
                            <span>Round Off:</span>
                            <span>${GSTUtils.formatINR(po.roundOff)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-top: 2px solid #0f172a; margin-top: 0.3rem; font-size: 1.05rem; font-weight: 700;">
                            <span>Grand Total:</span>
                            <span style="color: #1e3a8a;">${GSTUtils.formatINR(po.grandTotal)}</span>
                        </div>
                    </div>
                </div>

                <div style="font-size: 0.8rem; color: #475569; margin-bottom: 2.5rem; background: #f8fafc; padding: 0.85rem; border-radius: 6px;">
                    <strong>Terms & Instructions:</strong>
                    <p style="margin: 0.2rem 0;">1. Material should strictly conform to our engineering specifications and Grade requirements.</p>
                    <p style="margin: 0.2rem 0;">2. Delivery challan, Tax Invoice, and Original Mill Test Certificate (MTC) must accompany consignment.</p>
                    <p style="margin: 0.2rem 0;">3. Remarks: ${po.notes || 'None'}</p>
                </div>

                <div class="print-signatures" style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 2rem;">
                    <div style="text-align: center; width: 200px; border-top: 1px solid #94a3b8; padding-top: 0.4rem; font-size: 0.8rem;">
                        Prepared By (Store / Purchase)
                    </div>
                    <div style="text-align: center; width: 220px; border-top: 1px solid #94a3b8; padding-top: 0.4rem; font-size: 0.8rem;">
                        <strong>For Shree Precision Industries Pvt. Ltd.</strong><br>
                        Authorized Signatory
                    </div>
                </div>
            </div>
        `;

        App.openModal("modal-po-view");
    },

    printCurrentPO() {
        window.print();
    }
};
