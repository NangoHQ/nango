export interface ExpensifyPolicy {
    shouldShowAutoApprovalOptions: boolean;
    role: string;
    chatReportIDAdmins: number;
    areCompanyCardsEnabled: boolean;
    shouldShowCustomReportTitleOption: boolean;
    areExpensifyCardsEnabled: boolean;
    type: string;
    areRulesEnabled: boolean;
    areConnectionsEnabled: boolean;
    approvalMode: string;
    maxExpenseAmountNoReceipt: number;
    areCategoriesEnabled: boolean;
    areReportFieldsEnabled: boolean;
    maxExpenseAmount: number;
    id: string;
    areWorkflowsEnabled: boolean;
    outputCurrency: string;
    owner: string;
    areInvoicesEnabled: boolean;
    avatarURL: string;
    created: string; // can also use Date if parsing
    eReceipts: boolean;
    shouldShowAutoReimbursementLimitOption: boolean;
    autoReimbursement: string;
    tax: {
        trackingEnabled: boolean;
    };
    areDistanceRatesEnabled: boolean;
    maxExpenseAge: number;
    isPolicyExpenseChatEnabled: string;
    ownerAccountID: number;
    name: string;
    areTagsEnabled: boolean;
    invoice: {
        markUp: number;
    };
    chatReportIDAnnounce: number;
}

export interface PolicyListResponse {
    policyList: ExpensifyPolicy[];
}
