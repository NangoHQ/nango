export interface Address {
    AddressType: 'STREET' | 'POBOX';
    AddressLine1?: string;
    AddressLine2?: string;
    City: string;
    Region: string;
    PostalCode: string;
    Country: string;
}

export interface Phone {
    PhoneType: 'DEFAULT' | 'DDI' | 'FAX' | 'MOBILE';
    PhoneNumber: string;
    PhoneAreaCode: string;
    PhoneCountryCode: string;
}

export interface Contact {
    ContactID: string;
    ContactStatus: 'ACTIVE' | 'INACTIVE';
    ContactNumber?: string;
    Name: string;
    EmailAddress: string;
    BankAccountDetails: string;
    TaxNumber?: string;
    Addresses: Address[];
    Phones: Phone[];
    UpdatedDateUTC: string;
    ContactGroups: unknown[];
    IsSupplier: boolean;
    IsCustomer: boolean;
    SalesTrackingCategories: string[];
    PurchasesTrackingCategories: string[];
    ContactPersons: unknown[];
    HasValidationErrors: boolean;
    StatusAttributeString: string;
}

interface Item {
    ItemID: string;
    Name: string;
    Code: string;
}

interface Tracking {
    TrackingCategoryID: string;
    Name: string;
    Option: string;
}

export interface LineItem {
    ItemCode: string;
    Description: string;
    Quantity: string;
    UnitAmount: string;
    TaxType: string;
    TaxAmount: string;
    LineAmount: string;
    AccountCode: string;
    AccountId: string;
    Item: Item;
    Tracking: Tracking[];
    LineItemID: string;
}

interface Account {
    AccountID: string;
    Code: string;
}

export interface Invoice {
    Type: 'ACCREC' | 'ACCPAY';
    Contact: Contact;
    Date: string; // Date in ISO string format
    DueDate: string; // Date in ISO string format
    DateString: string;
    DueDateString: string;
    Status: 'AUTHORISED' | 'DRAFT' | 'PAID';
    LineAmountTypes: 'Exclusive' | 'Inclusive' | 'NoTax';
    LineItems: LineItem[];
    SubTotal: string;
    TotalTax: string;
    Total: string;
    UpdatedDateUTC: string; // Date in ISO string format
    CurrencyCode: string;
    InvoiceID: string;
    InvoiceNumber: string;
    Payments: Payment[];
    AmountDue: string;
    AmountPaid: string;
    AmountCredited: string;
}

export interface Payment {
    PaymentID: string;
    Date: string; // Date in ISO string format
    BankAmount: number;
    Amount: number;
    CurrencyRate: number;
    PaymentType: 'ACCPAYPAYMENT' | 'ACCRECPAYMENT';
    Status: 'AUTHORISED' | 'PENDING' | 'VOIDED';
    UpdatedDateUTC: string; // Date in ISO string format
    HasAccount: boolean;
    IsReconciled: boolean;
    Account: Account;
    Invoice: Invoice;
    HasValidationErrors: boolean;
    CreditNote?: {
        CreditNoteID: string;
    };
}
