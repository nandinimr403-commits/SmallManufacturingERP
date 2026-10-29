/**
 * UdyogERP - Supplier Management Controller
 * Handles supplier directory, GSTIN verification, state jurisdiction mapping, and contact records.
 */

const SuppliersModule = {
    searchQuery: "",
    stateFilter: "ALL",

    init() {
        this.renderTable();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const searchInput = document.getElementById("supplier-search");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderTable();
            });
        }

        const stateFilter = document.getElementById("supplier-filter-state");
        if (stateFilter) {
            stateFilter.addEventListener("change", (e) => {
                this.stateFilter = e.target.value;
                this.renderTable();
            });
        }

        // Live GSTIN validator on typing/blur in modal
        const gstinInput = document.getElementById("supplier-gstin");
        if (gstinInput) {
            gstinInput.addEventListener("input", (e) => {
                this.handleGSTINInput(e.target.value);
            });
        }
    },

    handleGSTINInput(val) {
        const cleanVal = val.trim().toUpperCase();
        const hint = document.getElementById("supplier-gstin-hint");
        const stateSelect = document.getElementById("supplier-state");
        const company = StorageManager.getCompany();

        if (cleanVal.length >= 2) {
            const stateCode = cleanVal.substring(0, 2);
            if (GST_STATE_CODES[stateCode]) {
                if (stateSelect) stateSelect.value = stateCode;
                const isIntra = (stateCode === company.stateCode);
                const taxTypeBadge = isIntra ? 
                    '<span class="badge badge-info">Intra-State (CGST + SGST)</span>' : 
                    '<span class="badge badge-warning">Inter-State (IGST)</span>';

                if (cleanVal.length === 15) {
                    const validation = GSTUtils.validateGSTIN(cleanVal);
                    if (validation.valid) {
                        hint.innerHTML = `<span style="color: var(--success); font-weight: 600;">✓ Valid GSTIN: ${validation.stateName} (Code: ${validation.stateCode}) • PAN: ${validation.pan}</span> ${taxTypeBadge}`;
                        return;
                    }
                }
                hint.innerHTML = `State: <strong>${GST_STATE_CODES[stateCode]} (${stateCode})</strong> • ${taxTypeBadge}`;
                return;
            }
        }
        if (hint) hint.innerHTML = `<span class="form-helper">Format: 2 digits State Code + 10-char PAN + 1 Entity + 'Z' + 1 Check digit</span>`;
    },

    renderTable() {
        const tbody = document.getElementById("supplier-table-body");
        if (!tbody) return;

        const company = StorageManager.getCompany();
        let suppliers = StorageManager.getSuppliers();

        if (this.searchQuery) {
            suppliers = suppliers.filter(s =>
                s.name.toLowerCase().includes(this.searchQuery) ||
                (s.gstin && s.gstin.toLowerCase().includes(this.searchQuery)) ||
                (s.contactPerson && s.contactPerson.toLowerCase().includes(this.searchQuery)) ||
                (s.email && s.email.toLowerCase().includes(this.searchQuery))
            );
        }

        if (this.stateFilter !== "ALL") {
            if (this.stateFilter === "INTRA") {
                suppliers = suppliers.filter(s => s.stateCode === company.stateCode);
            } else if (this.stateFilter === "INTER") {
                suppliers = suppliers.filter(s => s.stateCode !== company.stateCode);
            }
        }

        if (suppliers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        <p>No registered suppliers found matching your query.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = suppliers.map(s => {
            const isIntra = (s.stateCode === company.stateCode);
            const gstBadge = isIntra ?
                `<span class="badge badge-info" title="CGST + SGST applicable">Intra-State (${s.stateCode})</span>` :
                `<span class="badge badge-warning" title="IGST applicable">Inter-State (${s.stateCode})</span>`;

            return `
                <tr>
                    <td>
                        <span class="cell-primary font-mono">${s.id}</span>
                        <span class="cell-subtext">${s.paymentTerms || 'Net 30'}</span>
                    </td>
                    <td>
                        <span class="cell-primary">${s.name}</span>
                        <span class="cell-subtext">${s.address || s.stateName}</span>
                    </td>
                    <td>
                        <span class="cell-primary font-mono" style="font-size: 0.8rem;">${s.gstin}</span>
                        <span class="cell-subtext">${s.stateName}</span>
                    </td>
                    <td>
                        ${gstBadge}
                    </td>
                    <td>
                        <span class="cell-primary">${s.contactPerson || '—'}</span>
                        <span class="cell-subtext">Ph: ${s.phone || '—'}</span>
                    </td>
                    <td>
                        <span class="cell-subtext" style="color: var(--text-primary);">${s.email || '—'}</span>
                    </td>
                    <td class="text-right">
                        <div style="display: inline-flex; gap: 0.35rem;">
                            <button class="btn btn-xs btn-outline" onclick="SuppliersModule.openEditModal('${s.id}')">Edit</button>
                            <button class="btn btn-xs btn-outline" onclick="SuppliersModule.deleteSupplier('${s.id}')" style="color: var(--danger);">✕</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    },

    openCreateModal() {
        this.resetModalForm();
        document.getElementById("modal-supplier-title").textContent = "Register New Supplier";
        document.getElementById("supplier-id").value = "";
        this.populateStateDropdown();
        App.openModal("modal-supplier");
    },

    openEditModal(id) {
        const supplier = StorageManager.getSupplierById(id);
        if (!supplier) return;

        this.resetModalForm();
        document.getElementById("modal-supplier-title").textContent = "Edit Supplier Details";
        document.getElementById("supplier-id").value = supplier.id;
        document.getElementById("supplier-name").value = supplier.name;
        document.getElementById("supplier-legal-name").value = supplier.legalName || "";
        document.getElementById("supplier-gstin").value = supplier.gstin;
        this.populateStateDropdown();
        document.getElementById("supplier-state").value = supplier.stateCode;
        document.getElementById("supplier-contact-person").value = supplier.contactPerson || "";
        document.getElementById("supplier-phone").value = supplier.phone || "";
        document.getElementById("supplier-email").value = supplier.email || "";
        document.getElementById("supplier-payment-terms").value = supplier.paymentTerms || "Net 30 Days";
        document.getElementById("supplier-address").value = supplier.address || "";

        this.handleGSTINInput(supplier.gstin);
        App.openModal("modal-supplier");
    },

    populateStateDropdown() {
        const select = document.getElementById("supplier-state");
        if (!select) return;
        select.innerHTML = '<option value="">-- Select State / UT --</option>' +
            Object.entries(GST_STATE_CODES).map(([code, name]) => `<option value="${code}">${code} - ${name}</option>`).join("");
    },

    resetModalForm() {
        const form = document.getElementById("form-supplier");
        if (form) form.reset();
        const hint = document.getElementById("supplier-gstin-hint");
        if (hint) hint.innerHTML = `<span class="form-helper">Format: 2 digits State Code + 10-char PAN + 1 Entity + 'Z' + 1 Check digit</span>`;
        document.querySelectorAll("#form-supplier .form-error").forEach(el => el.textContent = "");
        document.querySelectorAll("#form-supplier .is-invalid").forEach(el => el.classList.remove("is-invalid"));
    },

    saveSupplierFromForm() {
        const id = document.getElementById("supplier-id").value;
        const name = document.getElementById("supplier-name").value.trim();
        const legalName = document.getElementById("supplier-legal-name").value.trim() || name;
        const gstin = document.getElementById("supplier-gstin").value.trim().toUpperCase();
        const stateCode = document.getElementById("supplier-state").value;
        const contactPerson = document.getElementById("supplier-contact-person").value.trim();
        const phone = document.getElementById("supplier-phone").value.trim();
        const email = document.getElementById("supplier-email").value.trim();
        const paymentTerms = document.getElementById("supplier-payment-terms").value;
        const address = document.getElementById("supplier-address").value.trim();

        let isValid = true;

        if (!name) {
            this.showFieldError("supplier-name", "Supplier business name is required");
            isValid = false;
        }

        // Validate GSTIN
        const gstinCheck = GSTUtils.validateGSTIN(gstin);
        if (!gstinCheck.valid) {
            this.showFieldError("supplier-gstin", gstinCheck.error);
            isValid = false;
        }

        if (!stateCode) {
            this.showFieldError("supplier-state", "Select state");
            isValid = false;
        }

        if (phone && !/^[0-9]{10}$/.test(phone.replace(/[^0-9]/g, ''))) {
            this.showFieldError("supplier-phone", "Enter a valid 10-digit Indian phone number");
            isValid = false;
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.showFieldError("supplier-email", "Enter a valid email address");
            isValid = false;
        }

        if (!isValid) return;

        const stateName = GST_STATE_CODES[stateCode] || "Other";
        const supplierData = {
            id: id || `SUP-${Date.now().toString().slice(-4)}`,
            name,
            legalName,
            gstin,
            stateCode,
            stateName,
            contactPerson,
            phone,
            email,
            paymentTerms,
            address
        };

        StorageManager.saveSupplier(supplierData);
        App.closeModal("modal-supplier");
        App.showToast("Success", `Supplier '${name}' saved successfully.`, "success");
        this.renderTable();
        // Also refresh Inventory supplier dropdown if open
        InventoryModule.populateSupplierDropdown();
    },

    deleteSupplier(id) {
        const s = StorageManager.getSupplierById(id);
        if (!s) return;

        if (confirm(`Are you sure you want to delete supplier '${s.name}'?`)) {
            StorageManager.deleteSupplier(id);
            App.showToast("Deleted", `Supplier '${s.name}' removed.`, "info");
            this.renderTable();
            InventoryModule.populateSupplierDropdown();
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
