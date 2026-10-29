/**
 * UdyogERP - Dashboard Controller
 * Computes high-level manufacturing KPIs, inventory health, low-stock warnings, and GST ITC metrics.
 */

const DashboardModule = {
    render() {
        this.renderKPIs();
        this.renderLowStockWidget();
        this.renderRecentOrders();
        this.renderGSTTaxOverview();
        this.renderRecentGRNs();
    },

    renderKPIs() {
        const inventory = StorageManager.getInventory();
        const pos = StorageManager.getPurchaseOrders();
        const invoices = StorageManager.getGSTInvoices();

        // 1. Total Inventory Valuation
        const totalValuation = inventory.reduce((sum, item) => {
            return sum + (Number(item.currentStock) * Number(item.unitPrice));
        }, 0);
        const elValuation = document.getElementById("kpi-stock-valuation");
        if (elValuation) elValuation.textContent = GSTUtils.formatINR(totalValuation);

        const elStockCount = document.getElementById("kpi-stock-items-count");
        if (elStockCount) elStockCount.textContent = `${inventory.length} active SKUs`;

        // 2. Low-Stock Alerts
        const lowStockItems = inventory.filter(item => Number(item.currentStock) <= Number(item.reorderLevel));
        const elLowStock = document.getElementById("kpi-low-stock-count");
        if (elLowStock) elLowStock.textContent = lowStockItems.length;

        // Update badge in sidebar
        const badgeLowStock = document.getElementById("sidebar-low-stock-badge");
        if (badgeLowStock) {
            badgeLowStock.textContent = lowStockItems.length;
            badgeLowStock.style.display = lowStockItems.length > 0 ? "inline-block" : "none";
        }

        // 3. Open POs
        const openPOs = pos.filter(p => p.status === "Issued" || p.status === "Partially Received");
        const elOpenPOs = document.getElementById("kpi-open-pos-count");
        if (elOpenPOs) elOpenPOs.textContent = openPOs.length;

        const totalOpenPOValue = openPOs.reduce((sum, p) => sum + (Number(p.grandTotal) || 0), 0);
        const elOpenPOVal = document.getElementById("kpi-open-pos-value");
        if (elOpenPOVal) elOpenPOVal.textContent = `${GSTUtils.formatINR(totalOpenPOValue)} pending delivery`;

        // 4. Month's Total Input Tax Credit (ITC)
        let eligibleITC = 0;
        let totalPurchases = 0;
        invoices.forEach(inv => {
            if (inv.itcEligibility === "Eligible") {
                const tax = (Number(inv.cgstAmount) || 0) + (Number(inv.sgstAmount) || 0) + (Number(inv.igstAmount) || 0);
                eligibleITC += tax;
            }
            totalPurchases += Number(inv.totalInvoiceAmount) || 0;
        });

        const elITC = document.getElementById("kpi-gst-itc");
        if (elITC) elITC.textContent = GSTUtils.formatINR(eligibleITC);

        const elPurchases = document.getElementById("kpi-gst-purchases");
        if (elPurchases) elPurchases.textContent = `${GSTUtils.formatINR(totalPurchases)} total purchases`;
    },

    renderLowStockWidget() {
        const inventory = StorageManager.getInventory();
        const lowStockItems = inventory.filter(item => Number(item.currentStock) <= Number(item.reorderLevel));
        const container = document.getElementById("dashboard-low-stock-list");
        const banner = document.getElementById("dashboard-low-stock-banner");

        if (!container) return;

        if (lowStockItems.length === 0) {
            if (banner) banner.style.display = "none";
            container.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty">
                        <p style="color: var(--success); font-weight: 600;">All inventory items are currently above safety reorder levels.</p>
                    </td>
                </tr>
            `;
            return;
        }

        if (banner) {
            banner.style.display = "flex";
            const bannerText = document.getElementById("dashboard-banner-text");
            if (bannerText) {
                bannerText.innerHTML = `<strong>Attention Required:</strong> ${lowStockItems.length} manufacturing item(s) have dropped below minimum reorder thresholds. Immediate replenishment recommended.`;
            }
        }

        container.innerHTML = lowStockItems.slice(0, 5).map(item => {
            const shortage = Math.max(0, Number(item.reorderLevel) - Number(item.currentStock));
            const statusClass = item.currentStock <= 0 ? "badge-danger" : "badge-warning";
            const statusLabel = item.currentStock <= 0 ? "Out of Stock" : "Low Stock";

            return `
                <tr>
                    <td>
                        <span class="cell-primary">${item.name}</span>
                        <span class="cell-subtext">SKU: ${item.sku} | HSN: ${item.hsn}</span>
                    </td>
                    <td>
                        <span class="badge ${statusClass}">
                            <span class="badge-dot"></span>
                            ${statusLabel}
                        </span>
                    </td>
                    <td>
                        <span style="font-weight: 600; color: ${item.currentStock <= 0 ? 'var(--danger)' : 'var(--warning-text)'};">
                            ${item.currentStock} ${item.uom}
                        </span>
                        <span class="cell-subtext">Min: ${item.reorderLevel} ${item.uom}</span>
                    </td>
                    <td>
                        <span class="currency">${GSTUtils.formatINR(shortage * item.unitPrice)}</span>
                        <span class="cell-subtext">Need: +${shortage} ${item.uom}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-primary" onclick="PurchaseOrdersModule.openCreateModalWithItem('${item.id}', ${shortage})">
                            Raise PO
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    },

    renderRecentOrders() {
        const pos = StorageManager.getPurchaseOrders().slice(0, 5);
        const container = document.getElementById("dashboard-recent-pos");
        if (!container) return;

        if (pos.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty">No purchase orders found.</td>
                </tr>
            `;
            return;
        }

        container.innerHTML = pos.map(po => {
            let statusBadge = "badge-neutral";
            if (po.status === "Completed") statusBadge = "badge-success";
            else if (po.status === "Partially Received") statusBadge = "badge-info";
            else if (po.status === "Issued") statusBadge = "badge-warning";

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${po.poNumber}</span>
                        <span class="cell-subtext">Date: ${GSTUtils.formatDate(po.poDate)}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${po.supplierName}</span>
                        <span class="cell-subtext">State: ${po.supplierStateCode}</span>
                    </td>
                    <td>
                        <span class="currency">${GSTUtils.formatINR(po.grandTotal)}</span>
                        <span class="cell-subtext">${po.items.length} Line Item(s)</span>
                    </td>
                    <td>
                        <span class="badge ${statusBadge}">
                            <span class="badge-dot"></span>
                            ${po.status}
                        </span>
                    </td>
                    <td class="text-right">
                        <button class="btn btn-xs btn-outline" onclick="PurchaseOrdersModule.viewPurchaseOrder('${po.id}')">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    },

    renderGSTTaxOverview() {
        const invoices = StorageManager.getGSTInvoices();
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;
        let totalTaxable = 0;

        invoices.forEach(inv => {
            totalTaxable += Number(inv.taxableAmount) || 0;
            totalCGST += Number(inv.cgstAmount) || 0;
            totalSGST += Number(inv.sgstAmount) || 0;
            totalIGST += Number(inv.igstAmount) || 0;
        });

        const totalTax = totalCGST + totalSGST + totalIGST;
        const container = document.getElementById("dashboard-tax-breakdown");
        if (!container) return;

        const cgstPercent = totalTax > 0 ? Math.round((totalCGST / totalTax) * 100) : 0;
        const sgstPercent = totalTax > 0 ? Math.round((totalSGST / totalTax) * 100) : 0;
        const igstPercent = totalTax > 0 ? Math.round((totalIGST / totalTax) * 100) : 0;

        container.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem;">
                    <span>Total Taxable Purchases:</span>
                    <strong>${GSTUtils.formatINR(totalTaxable)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem;">
                    <span>Total GST Input Credit:</span>
                    <strong style="color: var(--primary-light);">${GSTUtils.formatINR(totalTax)}</strong>
                </div>
            </div>

            <!-- Progress Bar Split -->
            <div style="height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; display: flex; margin-bottom: 1rem;">
                <div style="width: ${cgstPercent}%; background-color: #2563eb;" title="CGST: ${cgstPercent}%"></div>
                <div style="width: ${sgstPercent}%; background-color: #0284c7;" title="SGST: ${sgstPercent}%"></div>
                <div style="width: ${igstPercent}%; background-color: #7c3aed;" title="IGST: ${igstPercent}%"></div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; text-align: center;">
                <div style="background: var(--bg-main); padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Central GST (CGST)</span>
                    <span style="font-size: 0.95rem; font-weight: 700; color: #2563eb;">${GSTUtils.formatINR(totalCGST)}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${cgstPercent}%</span>
                </div>
                <div style="background: var(--bg-main); padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">State GST (SGST)</span>
                    <span style="font-size: 0.95rem; font-weight: 700; color: #0284c7;">${GSTUtils.formatINR(totalSGST)}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${sgstPercent}%</span>
                </div>
                <div style="background: var(--bg-main); padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Interstate (IGST)</span>
                    <span style="font-size: 0.95rem; font-weight: 700; color: #7c3aed;">${GSTUtils.formatINR(totalIGST)}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${igstPercent}%</span>
                </div>
            </div>
        `;
    },

    renderRecentGRNs() {
        const grns = StorageManager.getGRNs().slice(0, 5);
        const container = document.getElementById("dashboard-recent-grns");
        if (!container) return;

        if (grns.length === 0) {
            container.innerHTML = `<tr><td colspan="4" class="table-empty">No goods receipt records found.</td></tr>`;
            return;
        }

        container.innerHTML = grns.map(grn => {
            const totalAccepted = grn.items.reduce((s, i) => s + Number(i.acceptedQty || 0), 0);
            const totalRejected = grn.items.reduce((s, i) => s + Number(i.rejectedQty || 0), 0);

            return `
                <tr>
                    <td>
                        <span class="cell-primary">${grn.grnNumber}</span>
                        <span class="cell-subtext">Date: ${GSTUtils.formatDate(grn.grnDate)}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${grn.supplierName}</span>
                        <span class="cell-subtext">Ref PO: ${grn.poNumber}</span>
                    </td>
                    <td>
                        <span style="color: var(--success); font-weight: 600;">Accepted: ${totalAccepted}</span>
                        ${totalRejected > 0 ? `<span style="color: var(--danger); font-size: 0.75rem; display: block;">Rejected: ${totalRejected}</span>` : ''}
                    </td>
                    <td class="text-right">
                        <button class="btn btn-xs btn-outline" onclick="GRNModule.viewGRN('${grn.id}')">View</button>
                    </td>
                </tr>
            `;
        }).join("");
    }
};
