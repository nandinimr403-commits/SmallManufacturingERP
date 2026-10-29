/**
 * UdyogERP - Inventory Management Controller
 * Handles stock master, categories, HSN tax configurations, reorder thresholds, and CRUD operations.
 */

const InventoryModule = {
    currentFilterCategory: "ALL",
    currentFilterStatus: "ALL",
    searchQuery: "",

    init() {
        this.renderTable();
        this.populateSupplierDropdown();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const searchInput = document.getElementById("inventory-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderTable();
            });
        }

        const categoryFilter = document.getElementById("inventory-filter-category");
        if (categoryFilter) {
            categoryFilter.addEventListener("change", (e) => {
                this.currentFilterCategory = e.target.value;
                this.renderTable();
            });
        }

        const statusFilter = document.getElementById("inventory-filter-status");
        if (statusFilter) {
            statusFilter.addEventListener("change", (e) => {
                this.currentFilterStatus = e.target.value;
                this.renderTable();
            });
        }
    },

    populateSupplierDropdown() {
        const select = document.getElementById("item-preferred-supplier");
        if (!select) return;
        const suppliers = StorageManager.getSuppliers();
        select.innerHTML = '<option value="">-- Select Preferred Supplier --</option>' +
            suppliers.map(s => `<option value="${s.id}">${s.name} (${s.stateName})</option>`).join("");
    },

    renderTable() {
        const tbody = document.getElementById("inventory-table-body");
        if (!tbody) return;

        let items = StorageManager.getInventory();

        // Search Filter
        if (this.searchQuery) {
            items = items.filter(item => 
                item.name.toLowerCase().includes(this.searchQuery) ||
                item.sku.toLowerCase().includes(this.searchQuery) ||
                (item.hsn && item.hsn.toLowerCase().includes(this.searchQuery))
            );
        }

        // Category Filter
        if (this.currentFilterCategory !== "ALL") {
            items = items.filter(item => item.category === this.currentFilterCategory);
        }

        // Status Filter
        if (this.currentFilterStatus === "LOW") {
            items = items.filter(item => Number(item.currentStock) <= Number(item.reorderLevel) && Number(item.currentStock) > 0);
        } else if (this.currentFilterStatus === "OUT") {
            items = items.filter(item => Number(item.currentStock) <= 0);
        } else if (this.currentFilterStatus === "IN_STOCK") {
            items = items.filter(item => Number(item.currentStock) > Number(item.reorderLevel));
        }

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="table-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>
                        <p>No inventory items found matching the selected criteria.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const stock = Number(item.currentStock);
            const reorder = Number(item.reorderLevel);

            let statusBadge = `<span class="badge badge-success"><span class="badge-dot"></span> In Stock</span>`;
            if (stock <= 0) {
                statusBadge = `<span class="badge badge-danger"><span class="badge-dot"></span> Out of Stock</span>`;
            } else if (stock <= reorder) {
                statusBadge = `<span class="badge badge-warning"><span class="badge-dot"></span> Low Stock</span>`;
            }

            const supplier = StorageManager.getSupplierById(item.preferredSupplierId);
            const supplierName = supplier ? supplier.name : "—";
            const totalValue = stock * Number(item.unitPrice);

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${item.sku}</span>
                        <span class="cell-subtext">Loc: ${item.location || 'Warehouse'}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${item.name}</span>
                        <span class="cell-subtext">Category: ${item.category}</span>
                    </td>
                    <td>
                        <span class="badge badge-neutral">${item.hsn}</span>
                        <span class="cell-subtext">GST: ${item.taxRate}%</span>
                    </td>
                    <td>
                        <span style="font-weight: 700; color: ${stock <= reorder ? 'var(--warning-text)' : 'var(--text-primary)'}">
                            ${stock} ${item.uom}
                        </span>
                        <span class="cell-subtext">Reorder: ${reorder} ${item.uom}</span>
                    </td>
                    <td>
                        ${statusBadge}
                    </td>
                    <td>
                        <span class="currency">${GSTUtils.formatINR(item.unitPrice)}</span>
                        <span class="cell-subtext">Val: ${GSTUtils.formatINR(totalValue)}</span>
                    </td>
                    <td>
                        <span class="cell-primary" style="font-size: 0.8rem;">${supplierName}</span>
                    </td>
                    <td class="text-right">
                        <div style="display: inline-flex; gap: 0.35rem;">
                            ${stock <= reorder ? `
                                <button class="btn btn-xs btn-primary" title="Raise Purchase Order" onclick="PurchaseOrdersModule.openCreateModalWithItem('${item.id}', ${Math.max(1, reorder - stock)})">
                                    PO
                                </button>
                            ` : ''}
                            <button class="btn btn-xs btn-outline" title="Edit Item" onclick="InventoryModule.openEditModal('${item.id}')">
                                Edit
                            </button>
                            <button class="btn btn-xs btn-outline" title="Delete Item" onclick="InventoryModule.deleteItem('${item.id}')" style="color: var(--danger);">
                                ✕
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    },

    openCreateModal() {
        this.resetModalForm();
        document.getElementById("modal-inventory-title").textContent = "Add New Manufacturing Item";
        document.getElementById("item-id").value = "";
        this.populateSupplierDropdown();
        App.openModal("modal-inventory-item");
    },

    openEditModal(id) {
        const item = StorageManager.getInventoryById(id);
        if (!item) return;

        this.resetModalForm();
        document.getElementById("modal-inventory-title").textContent = "Edit Inventory Item";
        document.getElementById("item-id").value = item.id;
        document.getElementById("item-sku").value = item.sku;
        document.getElementById("item-name").value = item.name;
        document.getElementById("item-category").value = item.category;
        document.getElementById("item-hsn").value = item.hsn;
        document.getElementById("item-uom").value = item.uom;
        document.getElementById("item-current-stock").value = item.currentStock;
        document.getElementById("item-reorder-level").value = item.reorderLevel;
        document.getElementById("item-safety-stock").value = item.safetyStock || 0;
        document.getElementById("item-unit-price").value = item.unitPrice;
        document.getElementById("item-tax-rate").value = item.taxRate;
        document.getElementById("item-location").value = item.location || "";

        this.populateSupplierDropdown();
        document.getElementById("item-preferred-supplier").value = item.preferredSupplierId || "";

        App.openModal("modal-inventory-item");
    },

    resetModalForm() {
        const form = document.getElementById("form-inventory-item");
        if (form) form.reset();
        document.querySelectorAll("#form-inventory-item .form-error").forEach(el => el.textContent = "");
        document.querySelectorAll("#form-inventory-item .is-invalid").forEach(el => el.classList.remove("is-invalid"));
    },

    saveItemFromForm() {
        const id = document.getElementById("item-id").value;
        const sku = document.getElementById("item-sku").value.trim();
        const name = document.getElementById("item-name").value.trim();
        const category = document.getElementById("item-category").value;
        const hsn = document.getElementById("item-hsn").value.trim();
        const uom = document.getElementById("item-uom").value;
        const currentStock = parseFloat(document.getElementById("item-current-stock").value);
        const reorderLevel = parseFloat(document.getElementById("item-reorder-level").value);
        const safetyStock = parseFloat(document.getElementById("item-safety-stock").value) || 0;
        const unitPrice = parseFloat(document.getElementById("item-unit-price").value);
        const taxRate = parseFloat(document.getElementById("item-tax-rate").value);
        const preferredSupplierId = document.getElementById("item-preferred-supplier").value;
        const location = document.getElementById("item-location").value.trim();

        // Validation
        let isValid = true;
        if (!sku) {
            this.showFieldError("item-sku", "SKU is required");
            isValid = false;
        } else {
            // Check uniqueness
            const existing = StorageManager.getInventory().find(i => i.sku.toUpperCase() === sku.toUpperCase() && i.id !== id);
            if (existing) {
                this.showFieldError("item-sku", "An item with this SKU already exists");
                isValid = false;
            }
        }

        if (!name) {
            this.showFieldError("item-name", "Item name is required");
            isValid = false;
        }

        if (!hsn || !/^\d{4,8}$/.test(hsn)) {
            this.showFieldError("item-hsn", "Enter a valid 4 to 8 digit HSN code");
            isValid = false;
        }

        if (isNaN(currentStock) || currentStock < 0) {
            this.showFieldError("item-current-stock", "Stock cannot be negative");
            isValid = false;
        }

        if (isNaN(reorderLevel) || reorderLevel < 0) {
            this.showFieldError("item-reorder-level", "Reorder level cannot be negative");
            isValid = false;
        }

        if (isNaN(unitPrice) || unitPrice < 0) {
            this.showFieldError("item-unit-price", "Enter valid unit price");
            isValid = false;
        }

        if (!isValid) return;

        const itemData = {
            id: id || `INV-${Date.now().toString().slice(-4)}`,
            sku: sku.toUpperCase(),
            name,
            category,
            hsn,
            uom,
            currentStock,
            reorderLevel,
            safetyStock,
            unitPrice,
            taxRate,
            preferredSupplierId,
            location
        };

        StorageManager.saveInventoryItem(itemData);
        App.closeModal("modal-inventory-item");
        App.showToast("Success", `Inventory item '${name}' saved successfully.`, "success");
        this.renderTable();
    },

    deleteItem(id) {
        const item = StorageManager.getInventoryById(id);
        if (!item) return;

        if (confirm(`Are you sure you want to delete SKU '${item.sku} - ${item.name}'?`)) {
            StorageManager.deleteInventoryItem(id);
            App.showToast("Deleted", `Item '${item.name}' removed from inventory.`, "info");
            this.renderTable();
        }
    },

    showFieldError(fieldId, errorMsg) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.add("is-invalid");
            const parent = field.closest(".form-group");
            if (parent) {
                let errorSpan = parent.querySelector(".form-error");
                if (!errorSpan) {
                    errorSpan = document.createElement("span");
                    errorSpan.className = "form-error";
                    parent.appendChild(errorSpan);
                }
                errorSpan.textContent = errorMsg;
            }
        }
    }
};
