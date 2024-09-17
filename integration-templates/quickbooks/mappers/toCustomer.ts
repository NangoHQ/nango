import type { Customer, CreateCustomer, UpdateCustomer } from '../../models';
import type { QuickBooksCustomer } from '../types';

/**
 * Converts a QuickBooksCustomer object to a Customer object.
 * Only includes essential properties mapped from QuickBooksCustomer.
 * @param customer The QuickBooksCustomer object to convert.
 * @returns Customer object representing QuickBooks customer information.
 */
export function toCustomer(customer: QuickBooksCustomer): Customer {
    return {
        id: customer.Id,
        given_name: customer.GivenName ?? null,
        display_name: customer.DisplayName,
        active: customer.Active,
        balance_cents: customer.Balance * 100,
        taxable: customer.Taxable,
        primary_email: customer.PrimaryEmailAddr?.Address ?? null,
        primary_phone: customer.PrimaryPhone?.FreeFormNumber ?? null,
        bill_address: customer.BillAddr
            ? {
                  city: customer.BillAddr.City ?? null,
                  line1: customer.BillAddr.Line1 ?? null,
                  postal_code: customer.BillAddr.PostalCode ?? null,
                  country: customer.BillAddr.Country ?? null,
                  id: customer.BillAddr.Id
              }
            : null,
        ship_address: customer.ShipAddr
            ? {
                  city: customer.ShipAddr.City ?? null,
                  line1: customer.ShipAddr.Line1 ?? null,
                  postal_code: customer.ShipAddr.PostalCode ?? null,
                  country: customer.ShipAddr.Country ?? null,
                  id: customer.ShipAddr.Id
              }
            : null,
        created_at: new Date(customer.MetaData.CreateTime).toISOString(),
        updated_at: new Date(customer.MetaData.LastUpdatedTime).toISOString()
    };
}

/**
 * Maps the customer data from the input format to the QuickBooks customer structure.
 * This function checks for the presence of various fields in the customer object and maps them
 * to the corresponding fields expected by QuickBooks.
 *
 * @param {CreateCustomer | UpdateCustomer} customer - The customer data input object that needs to be mapped.
 * @returns {QuickBooksCustomer} - The mapped QuickBooks customer object.
 */
export function toQuickBooksCustomer(customer: CreateCustomer | UpdateCustomer): QuickBooksCustomer {
    const quickBooksCustomer: any = {};

    if ('id' in customer && 'sync_token' in customer) {
        const updateCustomer = customer;
        quickBooksCustomer.Id = updateCustomer.id;
        quickBooksCustomer.SyncToken = updateCustomer.sync_token;
        quickBooksCustomer.sparse = true;
    }

    if (customer.display_name) {
        quickBooksCustomer.DisplayName = customer.display_name;
    }

    if (customer.company_name) {
        quickBooksCustomer.CompanyName = customer.company_name;
    }

    if (customer.title) {
        quickBooksCustomer.Title = customer.title;
    }

    if (customer.given_name) {
        quickBooksCustomer.GivenName = customer.given_name;
    }

    if (customer.suffix) {
        quickBooksCustomer.Suffix = customer.suffix;
    }

    if (customer.primary_email) {
        quickBooksCustomer.PrimaryEmailAddr = {
            Address: customer.primary_email
        };
    }

    if (customer.primary_phone) {
        quickBooksCustomer.PrimaryPhone = {
            FreeFormNumber: customer.primary_phone
        };
    }

    if (customer.bill_address) {
        quickBooksCustomer.BillAddr = {};
        if (customer.bill_address.line1) {
            quickBooksCustomer.BillAddr.Line1 = customer.bill_address.line1;
        }
        if (customer.bill_address.line2) {
            quickBooksCustomer.BillAddr.Line2 = customer.bill_address.line2;
        }
        if (customer.bill_address.city) {
            quickBooksCustomer.BillAddr.City = customer.bill_address.city;
        }
        if (customer.bill_address.postal_code) {
            quickBooksCustomer.BillAddr.PostalCode = customer.bill_address.postal_code;
        }
        if (customer.bill_address.country) {
            quickBooksCustomer.BillAddr.Country = customer.bill_address.country;
        }
    }

    if (customer.ship_address) {
        quickBooksCustomer.ShipAddr = {};
        if (customer.ship_address.line1) {
            quickBooksCustomer.ShipAddr.Line1 = customer.ship_address.line1;
        }
        if (customer.ship_address.line2) {
            quickBooksCustomer.ShipAddr.Line2 = customer.ship_address.line2;
        }
        if (customer.ship_address.city) {
            quickBooksCustomer.ShipAddr.City = customer.ship_address.city;
        }
        if (customer.ship_address.postal_code) {
            quickBooksCustomer.ShipAddr.PostalCode = customer.ship_address.postal_code;
        }
        if (customer.ship_address.country) {
            quickBooksCustomer.ShipAddr.Country = customer.ship_address.country;
        }
    }

    if (customer.notes) {
        quickBooksCustomer.Notes = customer.notes;
    }

    return quickBooksCustomer;
}
