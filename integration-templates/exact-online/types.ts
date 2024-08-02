export interface ResponseGetBody<TResult> {
    d: {
        results: TResult;
    };
}
export interface ResponsePostBody<TResult> {
    d: TResult;
}

export interface EO_User {
    UserID: string;
    CurrentDivision: number;
    Email: string;
    FullName: string;
}

// https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=CRMAccounts
export interface EO_Account {
    ID: string;
    AddressLine1: string | null;
    AddressLine2: string | null;
    AddressLine3: string | null;
    BRIN: string | null;
    BSN: string | null;
    BusinessType: string | null;
    City: string | null;
    Country: string | null;
    CountryName: string | null;
    Created: string | null;
    CustomerSince: string | null;
    Division: number | null;
    Email: string | null;
    IsSales: boolean;
    Modified: string | null;
    Name: string;
    Phone: string | null;
    PhoneExtension: string | null;
    Postcode: string | null;
    SalesVATCode: string | null;
    State: string | null;
    StateName: string | null;
    Status: string | null;
    Type: string | null;
    VATNumber: string | null;
}

// https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=SalesInvoiceSalesInvoiceLines
export interface EO_SalesInvoiceLine {
    ID: string;
    AmountDC: number | null;
    AmountFC: number | null;
    CostCenter: string | null;
    CostCenterDescription: string | null;
    CostUnit: string | null;
    CostUnitDescription: string | null;
    CustomerItemCode: string | null;
    CustomField: string | null;
    DeliveryDate: string | null;
    Description: string | null;
    Discount: number | null;
    Division: number | null;
    Employee: string | null;
    EmployeeFullName: string | null;
    EndTime: string | null;
    ExtraDutyAmountFC: string | null;
    ExtraDutyPercentage: string | null;
    GLAccount: string | null;
    GLAccountDescription: string | null;
    InvoiceID: string | null;
    Item: string | null;
    ItemCode: string | null;
    ItemDescription: string | null;
    LineNumber: number | null;
    NetPrice: number | null;
    Notes: string | null;
    Pricelist: string | null;
    PricelistDescription: string | null;
    Project: string | null;
    ProjectDescription: string | null;
    ProjectWBS: string | null;
    ProjectWBSDescription: string | null;
    Quantity: number | null;
    SalesOrder: string | null;
    SalesOrderLine: string | null;
    SalesOrderLineNumber: number | null;
    SalesOrderNumber: number | null;
    StartTime: string | null;
    Subscription: string | null;
    SubscriptionDescription: string | null;
    TaxSchedule: string | null;
    TaxScheduleCode: string | null;
    TaxScheduleDescription: string | null;
    UnitCode: string | null;
    UnitDescription: string | null;
    UnitPrice: string | null;
    VATAmountDC: number | null;
    VATAmountFC: number | null;
    VATCode: string | null;
    VATCodeDescription: string | null;
    VATPercentage: number | null;
}

// https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=SalesInvoiceSalesInvoices
export interface E0_SalesInvoice {
    InvoiceID: string;
    AmountDC: number | null;
    AmountDiscount: number | null;
    AmountDiscountExclVat: number | null;
    AmountFC: number | null;
    AmountFCExclVat: number | null;
    Created: string | null;
    Creator: string | null;
    CreatorFullName: string | null;
    Currency: string | null;
    DeliverTo: string | null;
    DeliverToAddress: string | null;
    DeliverToContactPerson: string | null;
    DeliverToContactPersonFullName: string | null;
    DeliverToName: string | null;
    Description: string | null;
    Discount: number | null;
    DiscountType: number | null;
    Division: number | null;
    Document: string | null;
    DocumentNumber: number | null;
    DocumentSubject: string | null;
    DueDate: string | null;
    ExtraDutyAmountFC: number | null;
    GAccountAmountFC: number | null;
    IncotermAddress: string | null;
    IncotermCode: string | null;
    IncotermVersion: number | null;
    InvoiceDate: string | null;
    InvoiceNumber: string | null;
    InvoiceTo: string | null;
    InvoiceToContactPerson: string | null;
    InvoiceToContactPersonFullName: string | null;
    InvoiceToName: string | null;
    IsExtraDuty: string | null;
    Journal: number | null;
    JournalDescription: string | null;
    Modified: string | null;
    Modifier: string | null;
    ModifierFullName: string | null;
    OrderDate: string | null;
    OrderedBy: string | null;
    OrderedByContactPerson: string | null;
    OrderedByContactPersonFullName: string | null;
    OrderedByName: string | null;
    OrderNumber: number | null;
    PaymentCondition: string | null;
    PaymentConditionDescription: string | null;
    PaymentReference: string | null;
    Remarks: string | null;
    SalesChannel: string | null;
    SalesChannelCode: string | null;
    SalesChannelDescription: string | null;
    SalesInvoiceLines: EO_SalesInvoiceLine[] | null;
    SalesInvoiceOrderChargeLines: string | null;
    Salesperson: string | null;
    SalespersonFullName: string | null;
    SelectionCode: string | null;
    SelectionCodeCode: string | null;
    SelectionCodeDescription: string | null;
    ShippingMethod: string | null;
    ShippingMethodCode: string | null;
    ShippingMethodDescription: string | null;
    StarterSalesInvoiceStatus: string | null;
    StarterSalesInvoiceStatusDescription: string | null;
    Status: string | null;
    StatusDescription: string | null;
    TaxSchedule: string | null;
    TaxScheduleCode: string | null;
    TaxScheduleDescription: string | null;
    Type: string | null;
    TypeDescription: string | null;
    VATAmountDC: string | null;
    VATAmountFC: string | null;
    Warehouse: string | null;
    WithholdingTaxAmountFC: string | null;
    WithholdingTaxBaseAmount: string | null;
    WithholdingTaxPercentage: string | null;
    YourRef: string | null;
}

// https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=DocumentsDocuments
export interface EO_Document {
    Account: string;
    Subject: string;
    Type: number;
}

// https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=DocumentsDocumentAttachments
export interface EO_DocumentAttachment {
    Attachment: string;
    Document: string;
    FileName: string;
}

// https://start.exactonline.nl/docs/HlpRestAPIResourcesDetails.aspx?name=CashflowPayments
export interface EO_Payment {
    ID: string;
    Account: string | null;
    AccountBankAccountID: string | null;
    AccountBankAccountNumber: string | null;
    AccountCode: string | null;
    AccountContact: string | null;
    AccountContactName: string | null;
    AccountName: string | null;
    AmountDC: number | null;
    AmountDiscountDC: number | null;
    AmountDiscountFC: number | null;
    AmountFC: number | null;
    BankAccountID: string | null;
    BankAccountNumber: string | null;
    CashflowTransactionBatchCode: string | null;
    Created: string | null;
    Creator: string | null;
    CreatorFullName: string | null;
    Currency: string | null;
    Description: string | null;
    DiscountDueDate: string | null;
    Division: number | null;
    Document: string | null;
    DocumentNumber: number | null;
    DocumentSubject: string | null;
    DueDate: string | null;
    EndDate: string | null;
    EndPeriod: number | null;
    EndYear: number | null;
    EntryDate: string | null;
    EntryID: string | null;
    EntryNumber: number | null;
    GLAccount: string | null;
    GLAccountCode: string | null;
    GLAccountDescription: string | null;
    InvoiceDate: string | null;
    InvoiceNumber: number | null;
    IsBatchBooking: string | null;
    Journal: string | null;
    JournalDescription: string | null;
    Modified: string | null;
    Modifier: string | null;
    ModifierFullName: string | null;
    PaymentBatchNumber: number | null;
    PaymentCondition: string | null;
    PaymentConditionDescription: string | null;
    PaymentDays: number | null;
    PaymentDaysDiscount: number | null;
    PaymentDiscountPercentage: number | null;
    PaymentMethod: string | null;
    PaymentReference: string | null;
    PaymentSelected: string | null;
    PaymentSelector: string | null;
    PaymentSelectorFullName: string | null;
    RateFC: number | null;
    Source: string | null;
    Status: number | null;
    TransactionAmountDC: number | null;
    TransactionAmountFC: number | null;
    TransactionDueDate: string | null;
    TransactionEntryID: string | null;
    TransactionID: string | null;
    TransactionIsReversal: string | null;
    TransactionReportingPeriod: number | null;
    TransactionReportingYear: number | null;
    TransactionStatus: number | null;
    TransactionType: number | null;
    YourRef: string | null;
}
