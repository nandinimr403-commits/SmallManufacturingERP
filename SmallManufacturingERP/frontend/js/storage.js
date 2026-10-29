/**
 * UdyogERP - Database & Storage Manager
 * Seamlessly interfaces with SQLite backend REST API (when online)
 * and maintains reactive browser storage caching for zero-latency UI operation.
 */

const STORAGE_KEYS = {
    COMPANY: "udyog_company",
    SUPPLIERS: "udyog_suppliers",
    INVENTORY: "udyog_inventory",
    PURCHASE_ORDERS: "udyog_purchase_orders",
    GRNS: "udyog_grns",
    GST_INVOICES: "udyog_gst_invoices",
    DB_STATUS: "udyog_db_status"
};

const StorageManager = {
    apiBaseUrl: "http://127.0.0.1:5000/api",
    isBackendConnected: false,
    backendStats: null,
    listeners: [],

    async init() {
        // Initialize local cache with seed data if empty
        if (!localStorage.getItem(STORAGE_KEYS.COMPANY)) {
            localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(INITIAL_COMPANY));
        }
        if (!localStorage.getItem(STORAGE_KEYS.SUPPLIERS)) {
            localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(INITIAL_SUPPLIERS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
            localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(INITIAL_INVENTORY));
        }
        if (!localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS)) {
            localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(INITIAL_PURCHASE_ORDERS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.GRNS)) {
            localStorage.setItem(STORAGE_KEYS.GRNS, JSON.stringify(INITIAL_GRNS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.GST_INVOICES)) {
            localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(INITIAL_GST_INVOICES));
        }

        // Check backend SQLite database connection
        await this.checkBackendConnection();

        // Update UI database badges
        this.renderDatabaseBadge();
    },

    async checkBackendConnection(silent = true) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const res = await fetch(`${this.apiBaseUrl}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                this.isBackendConnected = true;
                this.backendStats = data;
                console.log("✓ Connected to UdyogERP SQLite Database API:", data);
                
                // Fetch stats and sync latest from SQLite
                await this.fetchBackendStats();
                await this.syncFromBackend();
                this.renderDatabaseBadge();
                if (!silent && window.App) {
                    App.showToast("Database Connected", "Connected to Python SQLite Database successfully.", "success");
                }
                return true;
            }
        } catch (err) {
            this.isBackendConnected = false;
            console.log("ℹ Backend API offline, operating in Browser Local Database mode.");
        }

        this.renderDatabaseBadge();
        return false;
    },

    async fetchBackendStats() {
        if (!this.isBackendConnected) return null;
        try {
            const res = await fetch(`${this.apiBaseUrl}/database/stats`);
            if (res.ok) {
                this.backendStats = await res.json();
                return this.backendStats;
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    async syncFromBackend() {
        if (!this.isBackendConnected) return;

        try {
            // 1. Fetch Company
            const compRes = await fetch(`${this.apiBaseUrl}/company`);
            if (compRes.ok) {
                const comp = await compRes.json();
                if (comp) localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(comp));
            }

            // 2. Fetch Suppliers
            const suppRes = await fetch(`${this.apiBaseUrl}/suppliers`);
            if (suppRes.ok) {
                const data = await suppRes.json();
                if (data.suppliers) localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(data.suppliers));
            }

            // 3. Fetch Inventory
            const invRes = await fetch(`${this.apiBaseUrl}/inventory`);
            if (invRes.ok) {
                const data = await invRes.json();
                if (data.items) localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(data.items));
            }

            // 4. Fetch Purchase Orders
            const poRes = await fetch(`${this.apiBaseUrl}/purchase-orders`);
            if (poRes.ok) {
                const data = await poRes.json();
                if (data.purchaseOrders) localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(data.purchaseOrders));
            }

            // 5. Fetch GRNs
            const grnRes = await fetch(`${this.apiBaseUrl}/grn`);
            if (grnRes.ok) {
                const data = await grnRes.json();
                if (data.grns) localStorage.setItem(STORAGE_KEYS.GRNS, JSON.stringify(data.grns));
            }

            // 6. Fetch GST Invoices
            const gstRes = await fetch(`${this.apiBaseUrl}/gst/invoices`);
            if (gstRes.ok) {
                const data = await gstRes.json();
                if (data.invoices) localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(data.invoices));
            }

            this.notifyChange('all');
        } catch (err) {
            console.warn("Error syncing records from backend SQLite:", err);
        }
    },

    getAuthHeaders() {
        const headers = { "Content-Type": "application/json" };
        const token = localStorage.getItem("udyog_auth_token");
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return headers;
    },

    // ========================================================================
    // SYNCHRONOUS CRUD WRAPPERS (With Async Background SQLite Sync)
    // ========================================================================

    resetToDemoData() {
        localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(INITIAL_COMPANY));
        localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(INITIAL_SUPPLIERS));
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(INITIAL_INVENTORY));
        localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(INITIAL_PURCHASE_ORDERS));
        localStorage.setItem(STORAGE_KEYS.GRNS, JSON.stringify(INITIAL_GRNS));
        localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(INITIAL_GST_INVOICES));

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/database/reset`, {
                method: "POST",
                headers: this.getAuthHeaders()
            }).catch(e => console.warn(e));
        }

        this.notifyChange('all');
    },

    // Company
    getCompany() {
        const data = localStorage.getItem(STORAGE_KEYS.COMPANY);
        return data ? JSON.parse(data) : INITIAL_COMPANY;
    },
    saveCompany(company) {
        localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(company));
        this.notifyChange('company');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/company`, {
                method: "PUT",
                headers: this.getAuthHeaders(),
                body: JSON.stringify(company)
            }).catch(e => console.warn(e));
        }
    },

    // Suppliers
    getSuppliers() {
        const data = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
        return data ? JSON.parse(data) : [];
    },
    getSupplierById(id) {
        return this.getSuppliers().find(s => s.id === id);
    },
    saveSupplier(supplier) {
        const suppliers = this.getSuppliers();
        const index = suppliers.findIndex(s => s.id === supplier.id);
        if (index >= 0) {
            suppliers[index] = { ...suppliers[index], ...supplier };
        } else {
            suppliers.push(supplier);
        }
        localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
        this.notifyChange('suppliers');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/suppliers`, {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify(supplier)
            }).catch(e => console.warn(e));
        }
        return supplier;
    },
    deleteSupplier(id) {
        let suppliers = this.getSuppliers();
        suppliers = suppliers.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
        this.notifyChange('suppliers');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/suppliers/${id}`, {
                method: "DELETE",
                headers: this.getAuthHeaders()
            }).catch(e => console.warn(e));
        }
    },

    // Inventory
    getInventory() {
        const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
        return data ? JSON.parse(data) : [];
    },
    getInventoryById(id) {
        return this.getInventory().find(i => i.id === id);
    },
    saveInventoryItem(item) {
        const items = this.getInventory();
        const index = items.findIndex(i => i.id === item.id);
        if (index >= 0) {
            items[index] = { ...items[index], ...item };
        } else {
            items.push(item);
        }
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(items));
        this.notifyChange('inventory');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/inventory`, {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify(item)
            }).catch(e => console.warn(e));
        }
        return item;
    },
    updateInventoryStock(id, acceptedQty) {
        const items = this.getInventory();
        const item = items.find(i => i.id === id);
        if (item) {
            item.currentStock = Math.round((Number(item.currentStock) + Number(acceptedQty)) * 100) / 100;
            localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(items));
            this.notifyChange('inventory');

            if (this.isBackendConnected) {
                fetch(`${this.apiBaseUrl}/inventory/${id}`, {
                    method: "PUT",
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(item)
                }).catch(e => console.warn(e));
            }
            return item;
        }
        return null;
    },
    deleteInventoryItem(id) {
        let items = this.getInventory();
        items = items.filter(i => i.id !== id);
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(items));
        this.notifyChange('inventory');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/inventory/${id}`, {
                method: "DELETE",
                headers: this.getAuthHeaders()
            }).catch(e => console.warn(e));
        }
    },

    // Purchase Orders
    getPurchaseOrders() {
        const data = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
        return data ? JSON.parse(data) : [];
    },
    getPurchaseOrderById(id) {
        return this.getPurchaseOrders().find(p => p.id === id);
    },
    savePurchaseOrder(po) {
        const pos = this.getPurchaseOrders();
        const index = pos.findIndex(p => p.id === po.id);
        if (index >= 0) {
            pos[index] = { ...pos[index], ...po };
        } else {
            pos.unshift(po);
        }
        localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(pos));
        this.notifyChange('purchaseOrders');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/purchase-orders`, {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify(po)
            }).catch(e => console.warn(e));
        }
        return po;
    },
    updatePOStatus(id, newStatus) {
        const pos = this.getPurchaseOrders();
        const po = pos.find(p => p.id === id);
        if (po) {
            po.status = newStatus;
            localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(pos));
            this.notifyChange('purchaseOrders');

            if (this.isBackendConnected) {
                fetch(`${this.apiBaseUrl}/purchase-orders`, {
                    method: "POST",
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(po)
                }).catch(e => console.warn(e));
            }
        }
    },
    updatePOItemReceivedQty(poId, inventoryId, qtyReceived) {
        const pos = this.getPurchaseOrders();
        const po = pos.find(p => p.id === poId);
        if (po && po.items) {
            const item = po.items.find(i => i.inventoryId === inventoryId);
            if (item) {
                item.receivedQty = (Number(item.receivedQty) || 0) + Number(qtyReceived);
            }
            const allCompleted = po.items.every(i => (Number(i.receivedQty) || 0) >= Number(i.orderQty));
            const anyReceived = po.items.some(i => (Number(i.receivedQty) || 0) > 0);
            
            if (allCompleted) {
                po.status = "Completed";
            } else if (anyReceived) {
                po.status = "Partially Received";
            }
            localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(pos));
            this.notifyChange('purchaseOrders');

            if (this.isBackendConnected) {
                fetch(`${this.apiBaseUrl}/purchase-orders`, {
                    method: "POST",
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(po)
                }).catch(e => console.warn(e));
            }
        }
    },

    // Goods Receipt Notes (GRN)
    getGRNs() {
        const data = localStorage.getItem(STORAGE_KEYS.GRNS);
        return data ? JSON.parse(data) : [];
    },
    getGRNById(id) {
        return this.getGRNs().find(g => g.id === id);
    },
    saveGRN(grn) {
        const grns = this.getGRNs();
        const index = grns.findIndex(g => g.id === grn.id);
        if (index >= 0) {
            grns[index] = { ...grns[index], ...grn };
        } else {
            grns.unshift(grn);
        }
        localStorage.setItem(STORAGE_KEYS.GRNS, JSON.stringify(grns));
        this.notifyChange('grns');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/grn`, {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify(grn)
            }).catch(e => console.warn(e));
        }
        return grn;
    },

    // GST Purchase Invoices
    getGSTInvoices() {
        const data = localStorage.getItem(STORAGE_KEYS.GST_INVOICES);
        return data ? JSON.parse(data) : [];
    },
    getGSTInvoiceById(id) {
        return this.getGSTInvoices().find(inv => inv.id === id);
    },
    saveGSTInvoice(invoice) {
        const invoices = this.getGSTInvoices();
        const index = invoices.findIndex(inv => inv.id === invoice.id);
        if (index >= 0) {
            invoices[index] = { ...invoices[index], ...invoice };
        } else {
            invoices.unshift(invoice);
        }
        localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(invoices));
        this.notifyChange('gstInvoices');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/gst/invoices`, {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify(invoice)
            }).catch(e => console.warn(e));
        }
        return invoice;
    },
    deleteGSTInvoice(id) {
        let invoices = this.getGSTInvoices();
        invoices = invoices.filter(inv => inv.id !== id);
        localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(invoices));
        this.notifyChange('gstInvoices');

        if (this.isBackendConnected) {
            fetch(`${this.apiBaseUrl}/gst/invoices/${id}`, {
                method: "DELETE",
                headers: this.getAuthHeaders()
            }).catch(e => console.warn(e));
        }
    },

    // Observers / Events
    subscribe(callback) {
        this.listeners.push(callback);
    },
    notifyChange(entity) {
        this.listeners.forEach(cb => cb(entity));
        this.renderDatabaseBadge();
    },

    // ========================================================================
    // DATABASE STATUS & MANAGEMENT MODAL
    // ========================================================================

    renderDatabaseBadge() {
        const badgeEl = document.getElementById("topbar-db-badge");
        if (badgeEl) {
            if (this.isBackendConnected) {
                badgeEl.className = "db-badge badge-sqlite";
                badgeEl.innerHTML = `
                    <span class="db-dot dot-sqlite"></span>
                    <span>DB: SQLite (Live)</span>
                `;
                badgeEl.title = "Connected to Python SQLite database (backend/data/udyog_erp.db). Click to inspect.";
            } else {
                badgeEl.className = "db-badge badge-local";
                badgeEl.innerHTML = `
                    <span class="db-dot dot-local"></span>
                    <span>DB: Local Storage</span>
                `;
                badgeEl.title = "Operating in local browser storage mode. Click to test SQLite connection.";
            }
        }

        // Also update sidebar database status indicator
        const sideDot = document.getElementById("sidebar-db-indicator");
        if (sideDot) {
            sideDot.className = `status-indicator ${this.isBackendConnected ? 'indicator-online' : 'indicator-local'}`;
            sideDot.title = this.isBackendConnected ? "Connected to SQLite Database" : "Using Local Database";
        }
    },

    async openDatabaseModal() {
        const modal = document.getElementById("modal-database");
        if (!modal) return;

        await this.renderDatabaseModalContent();
        App.openModal("modal-database");
    },

    async renderDatabaseModalContent() {
        const contentEl = document.getElementById("database-modal-content");
        if (!contentEl) return;

        let stats = null;
        if (this.isBackendConnected) {
            stats = await this.fetchBackendStats();
        }

        const counts = {
            suppliers: this.getSuppliers().length,
            inventory: this.getInventory().length,
            purchaseOrders: this.getPurchaseOrders().length,
            grns: this.getGRNs().length,
            gstInvoices: this.getGSTInvoices().length
        };

        contentEl.innerHTML = `
            <div class="db-modal-section">
                <div class="db-status-card ${this.isBackendConnected ? 'db-card-connected' : 'db-card-standalone'}">
                    <div class="db-status-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                    </div>
                    <div class="db-status-details">
                        <div class="db-status-title">
                            ${this.isBackendConnected ? 'Python SQLite 3 Database: CONNECTED' : 'Browser Local Database: ACTIVE'}
                        </div>
                        <p class="db-status-sub">
                            ${this.isBackendConnected 
                                ? `Relational SQLite database file: <code class="font-mono">${stats ? stats.databaseFile : 'backend/data/udyog_erp.db'}</code>`
                                : 'Currently storing data locally in the browser. Start the Python Flask backend service to activate the relational SQLite database.'}
                        </p>
                    </div>
                </div>

                <div class="db-grid-stats">
                    <div class="db-stat-item">
                        <span class="db-stat-num">${counts.inventory}</span>
                        <span class="db-stat-label">Inventory SKUs</span>
                    </div>
                    <div class="db-stat-item">
                        <span class="db-stat-num">${counts.suppliers}</span>
                        <span class="db-stat-label">Vendors Registered</span>
                    </div>
                    <div class="db-stat-item">
                        <span class="db-stat-num">${counts.purchaseOrders}</span>
                        <span class="db-stat-label">Purchase Orders</span>
                    </div>
                    <div class="db-stat-item">
                        <span class="db-stat-num">${counts.grns}</span>
                        <span class="db-stat-label">GRN Inward Receipts</span>
                    </div>
                    <div class="db-stat-item">
                        <span class="db-stat-num">${counts.gstInvoices}</span>
                        <span class="db-stat-label">GST Tax Invoices</span>
                    </div>
                    <div class="db-stat-item">
                        <span class="db-stat-num">${this.isBackendConnected && stats ? stats.tables.users : '5'}</span>
                        <span class="db-stat-label">User Accounts</span>
                    </div>
                </div>

                <div class="db-actions-row">
                    <button class="btn btn-outline" onclick="StorageManager.checkBackendConnection(false)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        <span>Test Backend SQLite Connection</span>
                    </button>
                    <button class="btn btn-outline" onclick="StorageManager.exportDatabaseJSON()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Export Database (JSON Backup)</span>
                    </button>
                </div>

                <div class="db-info-box">
                    <strong>💡 How to run the SQLite Backend Service:</strong>
                    <pre class="font-mono" style="margin-top: 0.5rem; padding: 0.6rem; background: #f1f5f9; border-radius: 6px; font-size: 0.75rem;">
cd backend
python app.py
# API server starts at http://127.0.0.1:5000 with auto-seeded SQLite database</pre>
                </div>
            </div>
        `;
    },

    exportDatabaseJSON() {
        const fullBackup = {
            system: "UdyogERP Indian Small Manufacturing & GST ERP",
            exportDate: new Date().toISOString(),
            company: this.getCompany(),
            suppliers: this.getSuppliers(),
            inventory: this.getInventory(),
            purchaseOrders: this.getPurchaseOrders(),
            grns: this.getGRNs(),
            gstInvoices: this.getGSTInvoices()
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `UdyogERP_Database_Backup_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        App.showToast("Export Complete", "Complete ERP database backup downloaded successfully.", "success");
    }
};

// Initialize on script load
StorageManager.init();
