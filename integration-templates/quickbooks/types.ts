export interface QuickBooksAccount {
    FullyQualifiedName: string;
    domain: string;
    Name: string;
    Classification: string;
    AccountSubType: string;
    CurrencyRef: ReferenceType;
    CurrentBalanceWithSubAccounts: number;
    sparse: boolean;
    MetaData: MetaData;
    AccountType: string;
    CurrentBalance: number;
    Active: boolean;
    Description?: string;
    SyncToken: string;
    Id: string;
    AcctNum?: string;
    SubAccount: boolean;
}

export interface QuickBooksCustomer {
    Id: string;
    SyncToken: string;
    DisplayName: string;
    Title?: string;
    sparse: boolean;
    domain: string;
    GivenName?: string;
    MiddleName?: string;
    Suffix?: string;
    FamilyName?: string;
    PrimaryEmailAddr?: EmailAddress;
    ResaleNum?: string;
    SecondaryTaxIdentifier?: string;
    ARAccountRef?: ReferenceType;
    DefaultTaxCodeRef: ReferenceType;
    PreferredDeliveryMethod: 'Print' | 'Email' | 'None';
    GSTIN?: string;
    SalesTermRef?: ReferenceType;
    CustomerTypeRef?: ReferenceType;
    Fax?: TelephoneNumber;
    FreeFormNumber?: string;
    BusinessNumber?: string;
    BillWithParent: boolean;
    CurrencyRef?: ReferenceType;
    Mobile?: TelephoneNumber;
    Job: boolean;
    BalanceWithJobs: number;
    PrimaryPhone?: TelephoneNumber;
    OpenBalanceDate?: string;
    Taxable: boolean;
    AlternatePhone?: TelephoneNumber;
    MetaData: MetaData;
    ParentRef?: ReferenceType;
    Notes?: string;
    WebAddr?: string;
    URI?: string;
    Active: boolean;
    CompanyName?: string;
    Balance: number;
    ShipAddr?: PhysicalAddress;
    PaymentMethodRef?: ReferenceType;
    IsProject?: boolean;
    Source?: string;
    PrimaryTaxIdentifier?: string;
    GSTRegistrationType?: 'GST_REG_REG' | 'GST_REG_COMP' | 'GST_UNREG' | 'CONSUMER' | 'OVERSEAS' | 'SEZ' | 'DEEMED';
    PrintOnCheckName: string;
    BillAddr?: PhysicalAddress;
    FullyQualifiedName: string;
    Level?: number;
    TaxExemptionReasonId?: number;
}

export interface ReferenceType {
    value: string;
    name?: string;
}

interface MetaData {
    CreateTime: string;
    LastUpdatedTime: string;
}

interface EmailAddress {
    Address: string;
}

interface TelephoneNumber {
    FreeFormNumber?: string;
}

export type PhysicalAddressCreation = Omit<PhysicalAddress, 'Id'>;

export interface CreateQuickbooksCustomer extends Omit<QuickBooksCustomer, 'BillAddr' | 'ShipAddr'> {
    BillAddr?: PhysicalAddressCreation;
    ShipAddr?: PhysicalAddressCreation;
}

export interface PhysicalAddress {
    Line1?: string;
    Line2?: string;
    Line3?: string;
    Line4?: string;
    Line5?: string;
    City?: string;
    SubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
    CountrySubDivisionCode?: string;
    Lat?: string;
    Long?: string;
    Id: string;
}

interface LinkedTxn {
    TxnId: string;
    TxnType: string;
}

interface TaxLineDetail {
    TaxRateRef: ReferenceType;
    PercentBased: boolean;
    TaxPercent: number;
    NetAmountTaxable: number;
}

interface TaxLine {
    Amount: number;
    DetailType: string;
    TaxLineDetail: TaxLineDetail;
}

interface TxnTaxDetail {
    TxnTaxCodeRef?: ReferenceType;
    TotalTax: number;
    TaxLine?: TaxLine[];
}

interface CustomerMemo {
    value: string;
}

interface LinePayment {
    Amount: number;
    LinkedTxn?: {
        TxnId: string;
        TxnType: string;
        TxnLineId?: string;
    }[];
}

interface CreditChargeResponse {
    Status?: string;
    AuthCode?: string;
    TxnAuthorizationTime?: string;
    CCTransId?: string;
}

interface CreditChargeInfo {
    CcExpiryMonth?: number;
    CcExpiryYear?: number;
    NameOnAcct?: string;
    Type?: string;
    BillAddrStreet?: string;
    Amount?: number;
    PostalCode?: string;
    ProcessPayment?: boolean;
}

export interface QuickBooksPayment {
    Id: string;
    domain: string;
    TotalAmt: number;
    CustomerRef: ReferenceType;
    SyncToken: string;
    CurrencyRef?: ReferenceType;
    ProjectRef?: ReferenceType;
    PrivateNote?: string;
    PaymentMethodRef?: ReferenceType;
    UnappliedAmt?: number;
    DepositToAccountRef?: ReferenceType;
    ExchangeRate?: number;
    Line?: LinePayment[];
    TxnSource?: string;
    TxnDate: string;
    CreditCardPayment?: {
        CreditChargeResponse?: CreditChargeResponse;
        CreditChargeInfo?: CreditChargeInfo;
    };
    TransactionLocationType: string;
    Status?: 'Completed' | 'Unknown';
    PaymentRefNum?: string;
    TaxExemptionRef?: ReferenceType;
    MetaData: MetaData;
}

interface QuickBooksItemGroupLine {
    Qty: number;
    ItemRef: ReferenceType;
}

interface QuickBooksItemGroupDetail {
    ItemGroupLine: QuickBooksItemGroupLine[];
}

export interface QuickBooksItem {
    FullyQualifiedName: string;
    Sku?: string;
    ItemCategoryType?: string;
    domain: string;
    Name: string;
    TrackQtyOnHand: boolean;
    Type: string;
    PurchaseCost: number;
    QtyOnHand?: number;
    InvStartDate?: string;
    Taxable: boolean;
    ExpenseAccountRef?: ReferenceType;
    AssetAccountRef?: ReferenceType;
    IncomeAccountRef?: ReferenceType;
    TaxClassificationRef?: ReferenceType;
    ClassRef?: ReferenceType;
    SalesTaxCodeRef?: ReferenceType;
    SalesTaxIncluded?: boolean;
    ItemGroupDetail?: QuickBooksItemGroupDetail;
    sparse: boolean;
    Active: boolean;
    PrintGroupedItems?: boolean;
    SyncToken: string;
    UnitPrice: number;
    Id: string;
    Description?: string;
    PurchaseDesc?: string;
    UQCDisplayText?: string;
    Source?: string;
    MetaData: MetaData;
}

interface SalesItemLineDetail {
    TaxCodeRef?: ReferenceType;
    Qty?: number;
    UnitPrice?: number;
    DiscountRate?: number;
    ItemRef: ReferenceType;
}

export interface LineInvoice {
    Description?: string;
    DetailType: string;
    SalesItemLineDetail?: SalesItemLineDetail;
    LinkedTxn?: LinkedTxn[];
    SubTotalLineDetail?: object;
    Amount: number;
    LineNum: number;
    Id: string;
}

export interface QuickBooksInvoice {
    AllowIPNPayment: boolean;
    AllowOnlinePayment: boolean;
    AllowOnlineCreditCardPayment: boolean;
    AllowOnlineACHPayment: boolean;
    domain: string;
    sparse: boolean;
    Id: string;
    SyncToken: string;
    MetaData: MetaData;
    CustomField: any[];
    DocNumber: string;
    TxnDate: string;
    CurrencyRef: ReferenceType;
    LinkedTxn: LinkedTxn[];
    Line: LineInvoice[];
    TxnTaxDetail: TxnTaxDetail;
    CustomerRef: ReferenceType;
    CustomerMemo: CustomerMemo;
    BillAddr: PhysicalAddress;
    ShipAddr: PhysicalAddress;
    SalesTermRef: ReferenceType;
    DueDate: string;
    TotalAmt: number;
    ApplyTaxAfterDiscount: boolean;
    PrintStatus: string;
    EmailStatus: string;
    BillEmail: EmailAddress;
    Balance: number;
    PrivateNote?: string;
    ProjectRef?: ReferenceType;
    Deposit?: number;
}

export interface QuickBooksCreditMemo {
    RemainingCredit: number;
    domain: string;
    sparse: boolean;
    Id: string;
    SyncToken: string;
    MetaData: MetaData;
    CustomField: any[];
    DocNumber: string;
    TxnDate: string;
    CurrencyRef: ReferenceType;
    Line: LineInvoice[];
    TxnTaxDetail: TxnTaxDetail;
    CustomerRef: ReferenceType;
    ProjectRef?: ReferenceType;
    BillAddr: PhysicalAddress;
    ShipAddr?: PhysicalAddress;
    TotalAmt: number;
    ApplyTaxAfterDiscount: boolean;
    PrintStatus: string;
    EmailStatus: string;
    Balance: number;
}
