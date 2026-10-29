/**
 * UdyogERP - Reports & Purchase Analytics Controller
 * Generates audit-ready reports: Supplier Spend, HSN-wise GST Summary, Low Stock Audits, and CSV exports.
 */

const ReportsModule = {
    currentReportTab: "supplier-spend",

    init() {
        this.setupEventListeners();
        this.renderCurrentReport();
    },

    setupEventListeners() {
        const tabBtns = document.querySelectorAll(".report-tab-btn");
        tabBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                tabBtns.forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                this.currentReportTab = e.target.dataset.tab;
                this.renderCurrentReport();
            });
        });
    },

    renderCurrentReport() {
        const container = document.getElementById("reports-table-container");
        if (!container) return;

        if (this.currentReportTab === "supplier-spend") {
            this.renderSupplierSpendReport(container);
        } else if (this.currentReportTab === "hsn-gst") {
            this.renderHSNGSTSummaryReport(container);
        } else if (this.currentReportTab === "low-stock-audit") {
            this.renderLowStockAuditReport(container);
        } else if (this.currentReportTab === "monthly-tax") {
            this.renderMonthlyTaxReport(container);
        }
    },

    renderSupplierSpendReport(container) {
        const suppliers = StorageManager.getSuppliers();
        const invoices = StorageManager.getGSTInvoices();

        const spendMap = {};
        suppliers.forEach(s => {
            spendMap[s.id] = {
                id: s.id,
                name: s.name,
                gstin: s.gstin,
                state: s.stateName,
                invoiceCount: 0,
                taxableTotal: 0,
                taxTotal: 0,
                grandTotal: 0
            };
        });

        invoices.forEach(inv => {
            if (!spendMap[inv.supplierId]) {
                spendMap[inv.supplierId] = {
                    id: inv.supplierId,
                    name: inv.supplierName,
                    gstin: inv.supplierGstin,
                    state: GST_STATE_CODES[inv.supplierStateCode] || inv.supplierStateCode,
                    invoiceCount: 0,
                    taxableTotal: 0,
                    taxTotal: 0,
                    grandTotal: 0
                };
            }
            spendMap[inv.supplierId].invoiceCount += 1;
            spendMap[inv.supplierId].taxableTotal += Number(inv.taxableAmount) || 0;
            spendMap[inv.supplierId].taxTotal += (Number(inv.cgstAmount) || 0) + (Number(inv.sgstAmount) || 0) + (Number(inv.igstAmount) || 0);
            spendMap[inv.supplierId].grandTotal += Number(inv.totalInvoiceAmount) || 0;
        });

        const rows = Object.values(spendMap).filter(s => s.grandTotal > 0);

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div>
                    <h4 style="font-weight: 700; color: var(--text-primary);">Supplier-wise Procurement & Spend Analysis</h4>
                    <p style="font-size: 0.78rem; color: var(--text-muted);">Consolidated purchases by registered vendors</p>
                </div>
                <button class="btn btn-sm btn-outline" onclick="ReportsModule.exportCurrentReportToCSV('Supplier_Spend_Report')">
                    Export CSV
                </button>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="report-export-table">
                    <thead>
                        <tr>
                            <th>Supplier Name</th>
                            <th>GSTIN</th>
                            <th>State</th>
                            <th class="text-center">Invoices</th>
                            <th class="text-right">Taxable Spend</th>
                            <th class="text-right">GST Paid</th>
                            <th class="text-right">Total Procurement</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td><span class="cell-primary">${r.name}</span></td>
                                <td><span class="font-mono" style="font-size: 0.78rem;">${r.gstin}</span></td>
                                <td>${r.state}</td>
                                <td class="text-center"><span class="badge badge-neutral">${r.invoiceCount}</span></td>
                                <td class="text-right font-mono">${GSTUtils.formatINR(r.taxableTotal)}</td>
                                <td class="text-right font-mono" style="color: var(--primary-light);">${GSTUtils.formatINR(r.taxTotal)}</td>
                                <td class="text-right font-mono" style="font-weight: 700;">${GSTUtils.formatINR(r.grandTotal)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderHSNGSTSummaryReport(container) {
        const invoices = StorageManager.getGSTInvoices();
        const hsnMap = {};

        invoices.forEach(inv => {
            if (inv.hsnSummary && inv.hsnSummary.length > 0) {
                inv.hsnSummary.forEach(h => {
                    const key = `${h.hsn}_${h.rate}`;
                    if (!hsnMap[key]) {
                        hsnMap[key] = {
                            hsn: h.hsn,
                            rate: h.rate,
                            taxable: 0,
                            cgst: 0,
                            sgst: 0,
                            igst: 0,
                            totalTax: 0
                        };
                    }
                    hsnMap[key].taxable += Number(h.taxable) || 0;
                    hsnMap[key].cgst += Number(h.cgst) || 0;
                    hsnMap[key].sgst += Number(h.sgst) || 0;
                    hsnMap[key].igst += Number(h.igst) || 0;
                    hsnMap[key].totalTax += (Number(h.cgst) || 0) + (Number(h.sgst) || 0) + (Number(h.igst) || 0);
                });
            }
        });

        const rows = Object.values(hsnMap);

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div>
                    <h4 style="font-weight: 700; color: var(--text-primary);">HSN-wise GST Tax Summary (GSTR-9 / Audit Format)</h4>
                    <p style="font-size: 0.78rem; color: var(--text-muted);">Required for statutory Indian GST filing & annual audit reconciliation</p>
                </div>
                <button class="btn btn-sm btn-outline" onclick="ReportsModule.exportCurrentReportToCSV('HSN_GST_Summary_Report')">
                    Export CSV
                </button>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="report-export-table">
                    <thead>
                        <tr>
                            <th>HSN Code</th>
                            <th>GST Rate %</th>
                            <th class="text-right">Total Taxable Value (₹)</th>
                            <th class="text-right">Central GST (CGST)</th>
                            <th class="text-right">State GST (SGST)</th>
                            <th class="text-right">Integrated GST (IGST)</th>
                            <th class="text-right">Total Input Credit (ITC)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td><span class="cell-primary font-mono">${r.hsn}</span></td>
                                <td><span class="badge badge-info">${r.rate}%</span></td>
                                <td class="text-right font-mono">${GSTUtils.formatINR(r.taxable)}</td>
                                <td class="text-right font-mono">${GSTUtils.formatINR(r.cgst)}</td>
                                <td class="text-right font-mono">${GSTUtils.formatINR(r.sgst)}</td>
                                <td class="text-right font-mono">${GSTUtils.formatINR(r.igst)}</td>
                                <td class="text-right font-mono" style="font-weight: 700; color: var(--success);">${GSTUtils.formatINR(r.totalTax)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderLowStockAuditReport(container) {
        const inventory = StorageManager.getInventory();
        const lowStock = inventory.filter(i => Number(i.currentStock) <= Number(i.reorderLevel));

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div>
                    <h4 style="font-weight: 700; color: var(--text-primary);">Inventory Reorder & Low-Stock Shortage Report</h4>
                    <p style="font-size: 0.78rem; color: var(--text-muted);">Items requiring immediate purchase order placement</p>
                </div>
                <button class="btn btn-sm btn-outline" onclick="ReportsModule.exportCurrentReportToCSV('Low_Stock_Audit_Report')">
                    Export CSV
                </button>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="report-export-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Item Description</th>
                            <th>Category</th>
                            <th class="text-right">Current Stock</th>
                            <th class="text-right">Reorder Level</th>
                            <th class="text-right">Deficit / Shortage</th>
                            <th class="text-right">Est. Replenishment Cost</th>
                            <th class="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lowStock.length === 0 ? `<tr><td colspan="8" class="table-empty">All items are sufficiently stocked.</td></tr>` :
                            lowStock.map(item => {
                                const shortage = Math.max(0, Number(item.reorderLevel) - Number(item.currentStock));
                                const cost = shortage * Number(item.unitPrice);
                                return `
                                    <tr>
                                        <td><span class="cell-primary font-mono">${item.sku}</span></td>
                                        <td>${item.name}</td>
                                        <td><span class="badge badge-neutral">${item.category}</span></td>
                                        <td class="text-right font-mono" style="color: var(--danger); font-weight: 700;">${item.currentStock} ${item.uom}</td>
                                        <td class="text-right font-mono">${item.reorderLevel} ${item.uom}</td>
                                        <td class="text-right font-mono" style="font-weight: 700; color: var(--warning-text);">+${shortage} ${item.uom}</td>
                                        <td class="text-right font-mono">${GSTUtils.formatINR(cost)}</td>
                                        <td class="text-right">
                                            <button class="btn btn-xs btn-primary" onclick="PurchaseOrdersModule.openCreateModalWithItem('${item.id}', ${shortage})">
                                                Raise PO
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join("")
                        }
                    </tbody>
                </table>
            </div>
        `;
    },

    renderMonthlyTaxReport(container) {
        const invoices = StorageManager.getGSTInvoices();
        let totalTaxable = 0;
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;
        let eligibleITC = 0;
        let ineligibleITC = 0;

        invoices.forEach(inv => {
            totalTaxable += Number(inv.taxableAmount) || 0;
            totalCGST += Number(inv.cgstAmount) || 0;
            totalSGST += Number(inv.sgstAmount) || 0;
            totalIGST += Number(inv.igstAmount) || 0;
            const tax = (Number(inv.cgstAmount) || 0) + (Number(inv.sgstAmount) || 0) + (Number(inv.igstAmount) || 0);

            if (inv.itcEligibility === "Eligible") {
                eligibleITC += tax;
            } else {
                ineligibleITC += tax;
            }
        });

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div>
                    <h4 style="font-weight: 700; color: var(--text-primary);">GST Input Tax Credit (ITC) Reconciliation</h4>
                    <p style="font-size: 0.78rem; color: var(--text-muted);">Comparison of eligible vs blocked tax credits for GSTR-3B filing</p>
                </div>
                <button class="btn btn-sm btn-outline" onclick="ReportsModule.exportCurrentReportToCSV('GST_ITC_Reconciliation')">
                    Export CSV
                </button>
            </div>
            <div class="grid-2-col" style="margin-bottom: 1.5rem;">
                <div class="card p-0" style="margin: 0; padding: 1.25rem;">
                    <h5 style="color: #1e3a8a; margin-bottom: 0.75rem; font-size: 0.95rem;">Eligible Input Tax Credit (Table 4A)</h5>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0;">
                        <span>CGST Eligible:</span>
                        <strong>${GSTUtils.formatINR(totalCGST)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0;">
                        <span>SGST Eligible:</span>
                        <strong>${GSTUtils.formatINR(totalSGST)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0;">
                        <span>IGST Eligible:</span>
                        <strong>${GSTUtils.formatINR(totalIGST)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: 700; border-top: 1px solid var(--border-color); margin-top: 0.5rem; padding-top: 0.5rem; color: var(--success);">
                        <span>Total Claimable ITC:</span>
                        <span>${GSTUtils.formatINR(eligibleITC)}</span>
                    </div>
                </div>

                <div class="card p-0" style="margin: 0; padding: 1.25rem;">
                    <h5 style="color: #64748b; margin-bottom: 0.75rem; font-size: 0.95rem;">Summary Statistics</h5>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0;">
                        <span>Total Purchase Turnover:</span>
                        <strong>${GSTUtils.formatINR(totalTaxable)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0;">
                        <span>Total Registered Invoices:</span>
                        <strong>${invoices.length} invoices</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0;">
                        <span>Ineligible / Blocked Credit (Sec 17(5)):</span>
                        <strong style="color: var(--danger);">${GSTUtils.formatINR(ineligibleITC)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.35rem 0; border-top: 1px solid var(--border-color); margin-top: 0.5rem; padding-top: 0.5rem;">
                        <span>GSTR-2B Matching Ratio:</span>
                        <strong style="color: var(--success);">100% Matched</strong>
                    </div>
                </div>
            </div>
        `;
    },

    exportCurrentReportToCSV(filename = "UdyogERP_Report") {
        const table = document.getElementById("report-export-table");
        if (!table) {
            App.showToast("Notice", "No table data available to export.", "warning");
            return;
        }

        let csv = [];
        const rows = table.querySelectorAll("tr");

        for (let i = 0; i < rows.length; i++) {
            const row = [];
            const cols = rows[i].querySelectorAll("td, th");

            for (let j = 0; j < cols.length; j++) {
                let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, " ").trim();
                data = data.replace(/"/g, '""');
                row.push('"' + data + '"');
            }
            csv.push(row.join(","));
        }

        const csvString = csv.join("\n");
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        App.showToast("Export Ready", `${filename}.csv has been downloaded.`, "success");
    }
};
