/**
 * UdyogERP - Goods Receipt Note (GRN / Inward) Controller
 * Manages material inward, inspection acceptance/rejections, and automatically updates inventory balances in real time.
 */

const GRNModule = {
    searchQuery: "",
    currentGRNItems: [],

    init() {
        this.renderTable();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const searchInput = document.getElementById("grn-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderTable();
            });
        }

        const poSelect = document.getElementById("grn-po-select");
        if (poSelect) {
            poSelect.addEventListener("change", (e) => {
                this.loadPOForGRN(e.target.value);
            });
        }
    },

    renderTable() {
        const tbody = document.getElementById("grn-table-body");
        if (!tbody) return;

        let grns = StorageManager.getGRNs();

        if (this.searchQuery) {
            grns = grns.filter(g =>
                g.grnNumber.toLowerCase().includes(this.searchQuery) ||
                g.supplierName.toLowerCase().includes(this.searchQuery) ||
                g.poNumber.toLowerCase().includes(this.searchQuery) ||
                (g.challanNumber && g.challanNumber.toLowerCase().includes(this.searchQuery))
            );
        }

        if (grns.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        <p>No goods receipt notes recorded yet.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = grns.map(g => {
            const acceptedTotal = g.items.reduce((sum, i) => sum + Number(i.acceptedQty || 0), 0);
            const rejectedTotal = g.items.reduce((sum, i) => sum + Number(i.rejectedQty || 0), 0);

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${g.grnNumber}</span>
                        <span class="cell-subtext">Date: ${GSTUtils.formatDate(g.grnDate)}</span>
                    </td>
                    <td>
                        <span class="cell-primary font-mono">${g.poNumber}</span>
                        <span class="cell-subtext">Challan: ${g.challanNumber || '—'}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${g.supplierName}</span>
                        <span class="cell-subtext">Gate: ${g.gateEntryNumber || '—'}</span>
                    </td>
                    <td>
                        <span class="cell-subtext">${g.vehicleNumber || '—'}</span>
                    </td>
                    <td>
                        <span style="color: var(--success); font-weight: 700;">+${acceptedTotal}</span>
                        ${rejectedTotal > 0 ? `<span style="color: var(--danger); font-size: 0.72rem; display: block;">Rej: ${rejectedTotal}</span>` : ''}
                    </td>
                    <td>
                        <span class="badge badge-success"><span class="badge-dot"></span> ${g.status || 'Approved'}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn btn-xs btn-outline" onclick="GRNModule.viewGRN('${g.id}')">View</button>
                    </td>
                </tr>
            `;
        }).join("");
    },

    openCreateModalForPO(poId = "") {
        this.resetCreateModal();
        this.populateOpenPODropdown();
        this.generateNextGRNNumber();

        if (poId) {
            const poSelect = document.getElementById("grn-po-select");
            if (poSelect) {
                poSelect.value = poId;
                this.loadPOForGRN(poId);
            }
        }

        App.openModal("modal-grn-create");
    },

    generateNextGRNNumber() {
        const grns = StorageManager.getGRNs();
        const nextNum = (grns.length + 1).toString().padStart(4, '0');
        const input = document.getElementById("grn-number");
        if (input) input.value = `GRN/24-25/${nextNum}`;

        const dateInput = document.getElementById("grn-date");
        if (dateInput) {
            dateInput.value = new Date().toISOString().split("T")[0];
        }

        const challanDateInput = document.getElementById("grn-challan-date");
        if (challanDateInput) {
            challanDateInput.value = new Date().toISOString().split("T")[0];
        }
    },

    populateOpenPODropdown() {
        const select = document.getElementById("grn-po-select");
        if (!select) return;

        const pos = StorageManager.getPurchaseOrders().filter(p => p.status === "Issued" || p.status === "Partially Received");
        select.innerHTML = '<option value="">-- Select Pending Purchase Order --</option>' +
            pos.map(p => `<option value="${p.id}">${p.poNumber} — ${p.supplierName} (${p.status})</option>`).join("");
    },

    loadPOForGRN(poId) {
        const po = StorageManager.getPurchaseOrderById(poId);
        const container = document.getElementById("grn-po-items-tbody");
        const poDetailsBanner = document.getElementById("grn-po-details");

        if (!container) return;

        if (!po) {
            container.innerHTML = `<tr><td colspan="6" class="table-empty">Please select a purchase order above.</td></tr>`;
            if (poDetailsBanner) poDetailsBanner.style.display = "none";
            this.currentGRNItems = [];
            return;
        }

        if (poDetailsBanner) {
            poDetailsBanner.style.display = "block";
            poDetailsBanner.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                    <span><strong>Supplier:</strong> ${po.supplierName} (GSTIN: ${po.supplierGstin})</span>
                    <span><strong>Order Date:</strong> ${GSTUtils.formatDate(po.poDate)} | <strong>Status:</strong> ${po.status}</span>
                </div>
            `;
        }

        this.currentGRNItems = po.items.map((item, idx) => {
            const pendingQty = Math.max(0, Number(item.orderQty) - (Number(item.receivedQty) || 0));
            return {
                inventoryId: item.inventoryId,
                sku: item.sku,
                name: item.name,
                orderedQty: item.orderQty,
                previouslyReceivedQty: Number(item.receivedQty) || 0,
                pendingQty: pendingQty,
                receivedQty: pendingQty,
                acceptedQty: pendingQty,
                rejectedQty: 0,
                rejectionReason: "",
                batchNumber: `HEAT-${new Date().getFullYear().toString().slice(-2)}${Math.floor(1000 + Math.random() * 9000)}`,
                unitPrice: item.unitPrice,
                uom: item.uom
            };
        });

        this.renderGRNItemsTable();
    },

    renderGRNItemsTable() {
        const container = document.getElementById("grn-po-items-tbody");
        if (!container) return;

        container.innerHTML = this.currentGRNItems.map((item, idx) => `
            <tr>
                <td>
                    <span class="cell-primary">${item.name}</span>
                    <span class="cell-subtext">SKU: ${item.sku} | Ord: ${item.orderedQty} ${item.uom} | Prev: ${item.previouslyReceivedQty}</span>
                </td>
                <td style="width: 100px;">
                    <span class="badge badge-info" style="font-weight: 700;">${item.pendingQty} ${item.uom}</span>
                </td>
                <td style="width: 110px;">
                    <input type="number" class="form-control" min="0" max="${item.pendingQty}" value="${item.receivedQty}" 
                        oninput="GRNModule.handleGRNQtyChange(${idx}, 'received', this.value)">
                </td>
                <td style="width: 110px;">
                    <input type="number" class="form-control" min="0" value="${item.acceptedQty}" 
                        oninput="GRNModule.handleGRNQtyChange(${idx}, 'accepted', this.value)">
                </td>
                <td style="width: 110px;">
                    <input type="number" class="form-control" min="0" value="${item.rejectedQty}" 
                        oninput="GRNModule.handleGRNQtyChange(${idx}, 'rejected', this.value)">
                </td>
                <td style="min-width: 140px;">
                    <input type="text" class="form-control" placeholder="e.g. HEAT-9921" value="${item.batchNumber}" 
                        oninput="GRNModule.handleGRNBatchChange(${idx}, this.value)">
                </td>
            </tr>
        `).join("");
    },

    handleGRNQtyChange(index, field, value) {
        const val = parseFloat(value) || 0;
        const item = this.currentGRNItems[index];
        if (!item) return;

        if (field === 'received') {
            item.receivedQty = val;
            item.acceptedQty = Math.max(0, val - item.rejectedQty);
        } else if (field === 'accepted') {
            item.acceptedQty = val;
            item.rejectedQty = Math.max(0, item.receivedQty - val);
        } else if (field === 'rejected') {
            item.rejectedQty = val;
            item.acceptedQty = Math.max(0, item.receivedQty - val);
        }

        this.renderGRNItemsTable();
    },

    handleGRNBatchChange(index, val) {
        if (this.currentGRNItems[index]) {
            this.currentGRNItems[index].batchNumber = val.trim();
        }
    },

    resetCreateModal() {
        const form = document.getElementById("form-grn-create");
        if (form) form.reset();
        this.currentGRNItems = [];
        const container = document.getElementById("grn-po-items-tbody");
        if (container) container.innerHTML = "";
        const details = document.getElementById("grn-po-details");
        if (details) details.style.display = "none";
    },

    saveGRN() {
        const poId = document.getElementById("grn-po-select").value;
        const grnNumber = document.getElementById("grn-number").value.trim();
        const grnDate = document.getElementById("grn-date").value;
        const challanNumber = document.getElementById("grn-challan-number").value.trim();
        const challanDate = document.getElementById("grn-challan-date").value;
        const vehicleNumber = document.getElementById("grn-vehicle-number").value.trim().toUpperCase();
        const gateEntryNumber = document.getElementById("grn-gate-entry").value.trim();
        const remarks = document.getElementById("grn-remarks").value.trim();

        if (!poId) {
            App.showToast("Validation Error", "Please select a purchase order.", "danger");
            return;
        }

        if (!grnNumber) {
            App.showToast("Validation Error", "GRN Number is required.", "danger");
            return;
        }

        if (this.currentGRNItems.length === 0) {
            App.showToast("Validation Error", "No items to receive.", "danger");
            return;
        }

        const po = StorageManager.getPurchaseOrderById(poId);
        if (!po) return;

        // Verify some quantity is received
        const totalReceived = this.currentGRNItems.reduce((s, i) => s + Number(i.receivedQty || 0), 0);
        if (totalReceived <= 0) {
            App.showToast("Validation Error", "Total received quantity must be greater than zero.", "danger");
            return;
        }

        // 1. Save GRN Record
        const grnData = {
            id: `GRN-${Date.now().toString().slice(-4)}`,
            grnNumber,
            grnDate,
            poId: po.id,
            poNumber: po.poNumber,
            supplierId: po.supplierId,
            supplierName: po.supplierName,
            challanNumber,
            challanDate,
            vehicleNumber,
            gateEntryNumber,
            remarks: remarks || "Received and inspected against PO specifications.",
            status: "Approved",
            receivedBy: (window.AuthManager && AuthManager.getCurrentUser()) ? AuthManager.getCurrentUser().fullName : "Sunil Jadhav",
            items: this.currentGRNItems
        };

        StorageManager.saveGRN(grnData);

        // 2. CRITICAL AUTOMATION: Update Inventory Balances with Accepted Qty
        this.currentGRNItems.forEach(item => {
            const accepted = Number(item.acceptedQty) || 0;
            if (accepted > 0 && item.inventoryId) {
                StorageManager.updateInventoryStock(item.inventoryId, accepted);
                StorageManager.updatePOItemReceivedQty(po.id, item.inventoryId, accepted);
            }
        });

        App.closeModal("modal-grn-create");
        App.showToast("Stock Updated!", `GRN ${grnNumber} generated. Accepted goods added to inventory balances!`, "success");
        this.renderTable();
    },

    viewGRN(id) {
        const grn = StorageManager.getGRNById(id);
        if (!grn) return;

        const company = StorageManager.getCompany();
        const modalBody = document.getElementById("modal-grn-view-content");
        if (!modalBody) return;

        modalBody.innerHTML = `
            <div class="printable-document" id="printable-grn">
                <div class="print-header" style="display: flex; justify-content: space-between; border-bottom: 2px solid #059669; padding-bottom: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <h2 style="color: #059669; font-size: 1.3rem; margin-bottom: 0.2rem;">${company.name}</h2>
                        <p style="font-size: 0.8rem; color: #475569;">${company.address}</p>
                        <p style="font-size: 0.8rem; color: #475569;">GSTIN: <strong>${company.gstin}</strong></p>
                    </div>
                    <div style="text-align: right;">
                        <span style="display: inline-block; padding: 0.35rem 0.85rem; background: #059669; color: white; font-weight: 700; border-radius: 4px; font-size: 0.85rem; margin-bottom: 0.5rem;">GOODS RECEIPT NOTE (GRN)</span>
                        <p style="font-family: monospace; font-size: 1.05rem; font-weight: 700; margin: 0;">${grn.grnNumber}</p>
                        <p style="font-size: 0.8rem; color: #64748b;">Date: ${GSTUtils.formatDate(grn.grnDate)}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; background: #f8fafc; padding: 1rem; border-radius: 6px;">
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Supplier Name</span>
                        <strong>${grn.supplierName}</strong>
                    </div>
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">PO Reference</span>
                        <strong>${grn.poNumber}</strong>
                    </div>
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Delivery Challan</span>
                        <strong>${grn.challanNumber || '—'}</strong> (${GSTUtils.formatDate(grn.challanDate)})
                    </div>
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Vehicle No.</span>
                        <strong>${grn.vehicleNumber || '—'}</strong>
                    </div>
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Gate Entry No.</span>
                        <strong>${grn.gateEntryNumber || '—'}</strong>
                    </div>
                    <div>
                        <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Inspection Status</span>
                        <span class="badge badge-success">${grn.status || 'Approved'}</span>
                    </div>
                </div>

                <table class="data-table" style="width: 100%; margin-bottom: 1.5rem; border: 1px solid #e2e8f0;">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item Description</th>
                            <th>Batch / Heat No.</th>
                            <th class="text-right">Ordered</th>
                            <th class="text-right">Received</th>
                            <th class="text-right">Accepted</th>
                            <th class="text-right">Rejected</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${grn.items.map((i, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td>
                                    <strong>${i.name}</strong>
                                    <span style="font-size: 0.72rem; color: #64748b; display: block;">SKU: ${i.sku}</span>
                                </td>
                                <td><span class="font-mono">${i.batchNumber || '—'}</span></td>
                                <td class="text-right">${i.orderedQty}</td>
                                <td class="text-right">${i.receivedQty}</td>
                                <td class="text-right" style="color: var(--success); font-weight: 700;">${i.acceptedQty}</td>
                                <td class="text-right" style="color: ${i.rejectedQty > 0 ? 'var(--danger)' : 'inherit'};">${i.rejectedQty}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>

                <div style="font-size: 0.8rem; color: #475569; margin-bottom: 2rem;">
                    <strong>Remarks / Inspection Notes:</strong>
                    <p style="margin: 0.2rem 0;">${grn.remarks || 'Goods received and accepted as per drawing specifications.'}</p>
                </div>

                <div class="print-signatures" style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 2rem;">
                    <div style="text-align: center; width: 180px; border-top: 1px solid #94a3b8; padding-top: 0.4rem; font-size: 0.8rem;">
                        Stores Receiver
                    </div>
                    <div style="text-align: center; width: 180px; border-top: 1px solid #94a3b8; padding-top: 0.4rem; font-size: 0.8rem;">
                        Quality Inspector (QC)
                    </div>
                    <div style="text-align: center; width: 200px; border-top: 1px solid #94a3b8; padding-top: 0.4rem; font-size: 0.8rem;">
                        Plant Manager / Signatory
                    </div>
                </div>
            </div>
        `;

        App.openModal("modal-grn-view");
    }
};
