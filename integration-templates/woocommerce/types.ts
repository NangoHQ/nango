export interface WooCommerceOrder {
    id: number;
    parent_id: number;
    status: string;
    currency: string;
    version: string;
    prices_include_tax: boolean;
    date_created: Date;
    date_modified: Date;
    discount_total: string;
    discount_tax: string;
    shipping_total: string;
    shipping_tax: string;
    cart_tax: string;
    total: string;
    total_tax: string;
    customer_id: number;
    order_key: string;
    billing: Billing;
    shipping: Shipping;
    payment_method: string;
    payment_method_title: string;
    transaction_id: string;
    customer_ip_address: string;
    customer_user_agent: string;
    created_via: string;
    customer_note: string;
    date_completed: Date;
    date_paid: Date;
    cart_hash: string;
    number: number;
    meta_data: Metadata[];
    line_items: LineItems[];
    tax_lines: TaxLine[];
    shipping_lines: ShippingLine[];
    fee_lines: FeeLine[];
    coupon_lines: Couponline[];
    refunds: Refunds[];
    payment_url: string;
    is_editable: boolean;
    needs_payment: boolean;
    needs_processing: boolean;
    date_created_gmt: Date;
    date_modified_gmt: Date;
    date_completed_gmt: Date;
    date_paid_gmt: Date;
    currency_symbol: string;
    _links: Links[];
}

export interface WooCommerceCustomer {
    id: number;
    date_created: Date;
    date_created_gmt: Date;
    date_modified: Date;
    date_modified_gmt: Date;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    username: string;
    password: string;
    billing: Billing;
    shipping: Shipping;
    is_paying_customer: boolean;
    avatar_url: string;
    meta_data: Metadata[];
    _links: Links[];
}
interface Billing extends Shipping {
    email: string;
    phone: string;
}

interface Shipping {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
}

interface Metadata {
    id: number;
    key: string;
    value: string;
}

interface LineItems {
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    tax_class: string;
    subtotal: string;
    subtotal_tax: string;
    total: string;
    total_tax: string;
    taxes: TaxLine[];
    meta_data: Metadata[];
    sku: string;
    price: string;
}

interface TaxLine {
    id: number;
    rate_code: string;
    rate_id: number;
    label: string;
    compound: boolean;
    tax_total: string;
    shipping_tax_total: string;
    meta_data: Metadata[];
}

interface ShippingLine {
    id: number;
    method_title: string;
    method_id: string;
    total: string;
    total_tax: string;
    taxes: TaxLine[];
    meta_data: Metadata[];
}

interface FeeLine {
    id: number;
    name: string;
    tax_class: string;
    tax_status: string;
    total: string;
    total_tax: string;
    taxes: TaxLine[];
    meta_data: Metadata[];
}

interface Couponline {
    id: number;
    code: string;
    discount: string;
    discount_tax: string;
    meta_data: Metadata[];
}

interface Refunds {
    id: number;
    reason: string;
    total: string;
}

interface Links {
    self: Link[];
    collection: Link[];
}

interface Link {
    href: string;
}
