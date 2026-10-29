/**
 * UdyogERP - GST & Financial Utility Engine
 * Implements Indian Goods & Services Tax (GST) rules, tax splits, GSTIN validation and formatting.
 */

const GSTUtils = {
    /**
     * Regex for Indian 15-character GSTIN
     * Example: 27AABCS1429B1ZB
     */
    GSTIN_REGEX: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,

    /**
     * Validates GSTIN structure
     */
    validateGSTIN(gstin) {
        if (!gstin) return { valid: false, error: "GSTIN is required" };
        const cleanGstin = gstin.trim().toUpperCase();
        if (cleanGstin.length !== 15) {
            return { valid: false, error: "GSTIN must be exactly 15 characters long" };
        }
        if (!this.GSTIN_REGEX.test(cleanGstin)) {
            return { valid: false, error: "Invalid GSTIN format (e.g. 27AABCS1429B1ZB)" };
        }
        const stateCode = cleanGstin.substring(0, 2);
        if (!GST_STATE_CODES[stateCode]) {
            return { valid: false, error: `Invalid GST state code '${stateCode}'` };
        }
        return { 
            valid: true, 
            gstin: cleanGstin, 
            stateCode: stateCode, 
            stateName: GST_STATE_CODES[stateCode],
            pan: cleanGstin.substring(2, 12)
        };
    },

    /**
     * Determines whether transaction is Intra-State (CGST + SGST) or Inter-State (IGST)
     */
    getTaxType(supplierStateCode, buyerStateCode) {
        if (!supplierStateCode || !buyerStateCode) return "INTRA_STATE";
        return supplierStateCode.trim() === buyerStateCode.trim() ? "INTRA_STATE" : "INTER_STATE";
    },

    /**
     * Calculates line item tax breakdown based on supply type
     * @param {number} qty Quantity
     * @param {number} rate Unit Price
     * @param {number} discountPercent Line discount %
     * @param {number} gstRate Total GST rate (e.g. 18, 12, 5)
     * @param {string} taxType "INTRA_STATE" or "INTER_STATE"
     */
    calculateLineItemTax(qty, rate, discountPercent = 0, gstRate = 18, taxType = "INTRA_STATE") {
        const quantity = parseFloat(qty) || 0;
        const unitRate = parseFloat(rate) || 0;
        const discount = parseFloat(discountPercent) || 0;
        const taxPercentage = parseFloat(gstRate) || 0;

        const baseTotal = quantity * unitRate;
        const discountAmount = (baseTotal * discount) / 100;
        const taxableAmount = Math.max(0, baseTotal - discountAmount);

        let cgstRate = 0;
        let cgstAmount = 0;
        let sgstRate = 0;
        let sgstAmount = 0;
        let igstRate = 0;
        let igstAmount = 0;

        if (taxType === "INTRA_STATE") {
            cgstRate = taxPercentage / 2;
            sgstRate = taxPercentage / 2;
            cgstAmount = (taxableAmount * cgstRate) / 100;
            sgstAmount = (taxableAmount * sgstRate) / 100;
        } else {
            igstRate = taxPercentage;
            igstAmount = (taxableAmount * igstRate) / 100;
        }

        const totalTax = cgstAmount + sgstAmount + igstAmount;
        const lineTotal = taxableAmount + totalTax;

        return {
            quantity,
            unitRate,
            discountPercent: discount,
            discountAmount: this.round2(discountAmount),
            taxableAmount: this.round2(taxableAmount),
            taxType,
            cgstRate,
            cgstAmount: this.round2(cgstAmount),
            sgstRate,
            sgstAmount: this.round2(sgstAmount),
            igstRate,
            igstAmount: this.round2(igstAmount),
            totalTax: this.round2(totalTax),
            lineTotal: this.round2(lineTotal)
        };
    },

    /**
     * Computes order/invoice aggregate totals
     */
    computeDocumentTotals(lineItems) {
        let subtotal = 0; // total taxable
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;

        lineItems.forEach(item => {
            subtotal += parseFloat(item.taxableAmount) || 0;
            cgstTotal += parseFloat(item.cgstAmount) || 0;
            sgstTotal += parseFloat(item.sgstAmount) || 0;
            igstTotal += parseFloat(item.igstAmount) || 0;
        });

        subtotal = this.round2(subtotal);
        cgstTotal = this.round2(cgstTotal);
        sgstTotal = this.round2(sgstTotal);
        igstTotal = this.round2(igstTotal);

        const totalTax = this.round2(cgstTotal + sgstTotal + igstTotal);
        const unroundedGrand = subtotal + totalTax;
        const grandTotal = Math.round(unroundedGrand);
        const roundOff = this.round2(grandTotal - unroundedGrand);

        return {
            subtotal,
            cgstTotal,
            sgstTotal,
            igstTotal,
            totalTax,
            roundOff,
            grandTotal
        };
    },

    /**
     * Format number as Indian Rupee (INR)
     * e.g., 1234567.89 -> "₹ 12,34,567.89"
     */
    formatINR(amount, includeSymbol = true) {
        if (amount === undefined || amount === null || isNaN(amount)) {
            return includeSymbol ? "₹ 0.00" : "0.00";
        }
        const numeric = Number(amount);
        const formatter = new Intl.NumberFormat('en-IN', {
            style: includeSymbol ? 'currency' : 'decimal',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return formatter.format(numeric);
    },

    /**
     * Format standard dates to Indian display (DD-MM-YYYY)
     */
    formatDate(dateString) {
        if (!dateString) return "—";
        try {
            const parts = dateString.split("-");
            if (parts.length === 3) {
                // If already YYYY-MM-DD
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            const date = new Date(dateString);
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (e) {
            return dateString;
        }
    },

    round2(val) {
        return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
    }
};
