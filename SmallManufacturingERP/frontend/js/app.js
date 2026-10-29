/**
 * UdyogERP - Master Application Orchestrator
 * Controls view routing, modal states, toast alerts, global listeners,
 * authentication states, and database sync lifecycle.
 */

const App = {
    currentView: "view-dashboard",

    init() {
        console.log("Initializing UdyogERP Indian Manufacturing Suite...");
        
        // Setup state listeners
        StorageManager.subscribe((entity) => {
            this.handleDataMutation(entity);
        });

        // Initialize Authentication & Session Management
        AuthManager.init();
        AuthManager.subscribe((user) => {
            this.handleAuthChange(user);
        });

        this.setupNavigation();
        this.setupMobileMenu();
        this.setupCompanyBadge();
        this.setupAuthForms();

        // Initialize submodules
        DashboardModule.render();
        InventoryModule.init();
        SuppliersModule.init();
        PurchaseOrdersModule.init();
        GRNModule.init();
        GSTInvoicesModule.init();
        ReportsModule.init();

        this.updateHeaderBadge();
        StorageManager.renderDatabaseBadge();
    },

    setupNavigation() {
        const navItems = document.querySelectorAll(".nav-item");
        navItems.forEach(item => {
            item.addEventListener("click", (e) => {
                const targetView = item.dataset.view;
                if (targetView) {
                    this.switchView(targetView);
                    
                    // Close mobile sidebar on navigation
                    const sidebar = document.getElementById("app-sidebar");
                    if (sidebar && window.innerWidth <= 1024) {
                        sidebar.classList.remove("open");
                    }
                }
            });
        });
    },

    switchView(viewId) {
        // Update nav items
        document.querySelectorAll(".nav-item").forEach(item => {
            item.classList.toggle("active", item.dataset.view === viewId);
        });

        // Hide all views and show target
        document.querySelectorAll(".view-section").forEach(view => {
            view.classList.remove("active");
        });

        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.classList.add("active");
            this.currentView = viewId;
        }

        // Update page title
        const titles = {
            "view-dashboard": { title: "Executive Manufacturing Dashboard", sub: "Plant Procurement, Inventory Health & GST Input Tax Credit" },
            "view-inventory": { title: "Raw Material & Consumable Inventory", sub: "Stock Balances, HSN Classifications, Safety Levels & Valuation" },
            "view-suppliers": { title: "Approved Vendor Directory", sub: "Supplier Master, GSTIN State Mapping & Commercial Terms" },
            "view-purchase-orders": { title: "Purchase Orders & Procurement", sub: "Dynamic PO Builder with Live Intra/Inter-State Tax Splitting" },
            "view-grn": { title: "Goods Receipt Note (GRN / Inward)", sub: "Gate Inward, QC Rejections, Heat/Batch Tracking & Stock Auto-Sync" },
            "view-invoices": { title: "GST Purchase Register & Invoices", sub: "B2B Tax Vouchers, CGST/SGST/IGST Splits & GSTR-2B Reconciliation" },
            "view-low-stock": { title: "Critical Low-Stock & Reorder Alerts", sub: "Items at or below safety stock threshold requiring urgent replenishment" },
            "view-reports": { title: "Procurement & Tax Audit Reports", sub: "Supplier Spend, HSN-wise GST Summary & GSTR-3B ITC Breakdowns" }
        };

        const titleInfo = titles[viewId] || { title: "UdyogERP", sub: "" };
        const pageTitleEl = document.getElementById("page-title-text");
        const pageSubEl = document.getElementById("page-subtitle-text");
        if (pageTitleEl) pageTitleEl.textContent = titleInfo.title;
        if (pageSubEl) pageSubEl.textContent = titleInfo.sub;

        // Trigger specific view renders
        if (viewId === "view-dashboard") DashboardModule.render();
        else if (viewId === "view-inventory") InventoryModule.renderTable();
        else if (viewId === "view-suppliers") SuppliersModule.renderTable();
        else if (viewId === "view-purchase-orders") PurchaseOrdersModule.renderTable();
        else if (viewId === "view-grn") GRNModule.renderTable();
        else if (viewId === "view-invoices") GSTInvoicesModule.renderTable();
        else if (viewId === "view-reports") ReportsModule.renderCurrentReport();
        else if (viewId === "view-low-stock") this.renderLowStockView();
    },

    renderLowStockView() {
        const inventory = StorageManager.getInventory();
        const lowStock = inventory.filter(i => Number(i.currentStock) <= Number(i.reorderLevel));
        const container = document.getElementById("low-stock-full-table");
        if (!container) return;

        if (lowStock.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                        <p style="color: var(--success); font-weight: 600;">Excellent! All inventory items are currently above their reorder thresholds.</p>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = lowStock.map(item => {
            const shortage = Math.max(0, Number(item.reorderLevel) - Number(item.currentStock));
            const supplier = StorageManager.getSupplierById(item.preferredSupplierId);
            const supplierName = supplier ? supplier.name : "—";
            const estCost = shortage * item.unitPrice;

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${item.sku}</span>
                        <span class="cell-subtext">Loc: ${item.location || 'Warehouse'}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${item.name}</span>
                        <span class="cell-subtext">Category: ${item.category} | HSN: ${item.hsn}</span>
                    </td>
                    <td>
                        <span class="badge ${item.currentStock <= 0 ? 'badge-danger' : 'badge-warning'}">
                            <span class="badge-dot"></span>
                            ${item.currentStock <= 0 ? 'Out of Stock' : 'Low Stock'}
                        </span>
                    </td>
                    <td>
                        <span style="font-weight: 700; color: ${item.currentStock <= 0 ? 'var(--danger)' : 'var(--warning-text)'};">
                            ${item.currentStock} ${item.uom}
                        </span>
                        <span class="cell-subtext">Reorder Level: ${item.reorderLevel} ${item.uom}</span>
                    </td>
                    <td>
                        <span style="color: var(--danger); font-weight: 700;">+${shortage} ${item.uom}</span>
                        <span class="cell-subtext">Est: ${GSTUtils.formatINR(estCost)}</span>
                    </td>
                    <td>
                        <span class="cell-primary" style="font-size: 0.8rem;">${supplierName}</span>
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

    setupMobileMenu() {
        const toggleBtn = document.getElementById("mobile-menu-toggle");
        const sidebar = document.getElementById("app-sidebar");
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener("click", () => {
                sidebar.classList.toggle("open");
            });
        }
    },

    setupCompanyBadge() {
        const company = StorageManager.getCompany();
        const elName = document.getElementById("sidebar-company-name");
        const elGstin = document.getElementById("sidebar-company-gstin");
        if (elName) elName.textContent = company.name;
        if (elGstin) elGstin.textContent = `GSTIN: ${company.gstin}`;
    },

    setupAuthForms() {
        const loginForm = document.getElementById("auth-form-login-inner");
        if (loginForm) {
            loginForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const u = document.getElementById("login-username").value;
                const p = document.getElementById("login-password").value;
                AuthManager.login(u, p);
            });
        }

        const regForm = document.getElementById("auth-form-register-inner");
        if (regForm) {
            regForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const fn = document.getElementById("reg-fullname").value;
                const un = document.getElementById("reg-username").value;
                const em = document.getElementById("reg-email").value;
                const pwd = document.getElementById("reg-password").value;
                const role = document.getElementById("reg-role").value;
                const dept = document.getElementById("reg-dept").value;
                AuthManager.register(un, pwd, fn, em, role, dept);
            });
        }
    },

    handleAuthChange(user) {
        AuthManager.renderUserBadge();
        StorageManager.renderDatabaseBadge();
        if (this.currentView === "view-dashboard") DashboardModule.render();
    },

    updateHeaderBadge() {
        const inventory = StorageManager.getInventory();
        const lowStock = inventory.filter(i => Number(i.currentStock) <= Number(i.reorderLevel));
        const badge = document.getElementById("sidebar-low-stock-badge");
        if (badge) {
            badge.textContent = lowStock.length;
            badge.style.display = lowStock.length > 0 ? "inline-block" : "none";
        }
    },

    handleDataMutation(entity) {
        this.updateHeaderBadge();
        DashboardModule.render();

        if (this.currentView === "view-inventory") InventoryModule.renderTable();
        else if (this.currentView === "view-suppliers") SuppliersModule.renderTable();
        else if (this.currentView === "view-purchase-orders") PurchaseOrdersModule.renderTable();
        else if (this.currentView === "view-grn") GRNModule.renderTable();
        else if (this.currentView === "view-invoices") GSTInvoicesModule.renderTable();
        else if (this.currentView === "view-reports") ReportsModule.renderCurrentReport();
        else if (this.currentView === "view-low-stock") this.renderLowStockView();
    },

    // Modal Control
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add("open");
            document.body.style.overflow = "hidden";
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove("open");
            document.body.style.overflow = "";
        }
    },

    // Toast Notification System
    showToast(title, message, type = "info") {
        const container = document.getElementById("toast-container");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        let iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        if (type === "success") {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (type === "danger") {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        } else if (type === "warning") {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.style.opacity = "0";
                toast.style.transform = "translateX(50px)";
                setTimeout(() => toast.remove(), 200);
            }
        }, 4000);
    },

    confirmResetDemoData() {
        if (confirm("Reset all manufacturing inventory, suppliers, purchase orders, and GST invoices to original demo state?")) {
            StorageManager.resetToDemoData();
            this.showToast("Reset Complete", "ERP data has been restored to factory demo state.", "info");
            this.switchView("view-dashboard");
        }
    }
};

// Auto start when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});
