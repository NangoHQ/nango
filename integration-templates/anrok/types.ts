export interface AnrokTax {
    taxAmount: string;
    taxName: string;
    taxRate: string;
    taxableAmount: string;
}

export interface AnrokJuris {
    name: string | null;
    taxes: AnrokTax[];
    notTaxedReason: {
        type: string | null;
        reason?: {
            type: string;
        };
    };
}

export interface AnrokLineItem {
    id: string;
    taxAmountToCollect: number;
    preTaxAmount: string;
    jurises: AnrokJuris[];
}

export interface AnrokResponse {
    version: number;
    taxAmountToCollect: number;
    preTaxAmount: string;
    lineItems: AnrokLineItem[];
}
