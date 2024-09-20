import type { Customer, CreateCustomer, UpdateCustomer } from '../../models';
import type { QuickBooksCustomer, CreateQuickbooksCustomer, PhysicalAddressCreation } from '../types';

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
export function toQuickBooksCustomer(customer: CreateCustomer | UpdateCustomer): CreateQuickbooksCustomer {
    const quickBooksCustomer: Partial<CreateQuickbooksCustomer> = {};

    // Map fields for update customer
    if ('id' in customer && 'sync_token' in customer) {
        quickBooksCustomer.Id = customer.id;
        quickBooksCustomer.SyncToken = customer.sync_token;
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
        quickBooksCustomer.PrimaryEmailAddr = { Address: customer.primary_email };
    }

    if (customer.primary_phone) {
        quickBooksCustomer.PrimaryPhone = { FreeFormNumber: customer.primary_phone };
    }

    if (customer.bill_address) {
        quickBooksCustomer.BillAddr = mapAddress(customer.bill_address);
    }

    if (customer.ship_address) {
        quickBooksCustomer.ShipAddr = mapAddress(customer.ship_address);
    }

    if (customer.notes) {
        quickBooksCustomer.Notes = customer.notes;
    }

    return quickBooksCustomer as CreateQuickbooksCustomer;
}

/**
 * Maps a simplified address object to a `PhysicalAddressCreation` type,
 * including only properties that are defined and omitting `undefined` values.
 *
 * @param address - The simplified address object with optional properties.
 * @returns A `PhysicalAddressCreation` object with only defined address properties.
 */
function mapAddress(address: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string }): PhysicalAddressCreation {
    const result: Partial<PhysicalAddressCreation> = {};

    if (address.line1) result.Line1 = address.line1;
    if (address.line2) result.Line2 = address.line2;
    if (address.city) result.City = address.city;
    if (address.postal_code) result.PostalCode = address.postal_code;
    if (address.country) result.Country = address.country;

    return result as PhysicalAddressCreation;
}
