import type { NangoSync, Contact } from '../../models';

async function getTenantId(nango: NangoSync) {
    const tenants = await nango.get({
        endpoint: 'connections'
    });
    return tenants.data[0]['tenantId'];
}

export default async function fetchData(nango: NangoSync): Promise<void> {
    const tenant_id = await getTenantId(nango);

    const config = {
        endpoint: 'api.xro/2.0/Contacts',
        headers: {
            'xero-tenant-id': tenant_id,
            'If-Modified-Since': ''
        },
        params: {
            page: 1,
            includeArchived: 'false'
        }
    };

    await nango.log(`Last sync date - type: ${typeof nango.lastSyncDate} JSON value: ${JSON.stringify(nango.lastSyncDate)}`);

    // If it is an incremential sync, only fetch the changed contacts
    if (nango.lastSyncDate) {
        config.params.includeArchived = 'true';
        config.headers['If-Modified-Since'] = nango.lastSyncDate.toISOString().replace(/\.\d{3}Z$/, ''); // Returns yyyy-mm-ddThh:mm:ss
    }

    let page = 1;
    do {
        config.params.page = page;
        const res = await nango.get(config);
        const contacts = res.data.Contacts;

        // Save active contacts
        const activeContacts = contacts.filter((x: any) => x.ContactStatus === 'ACTIVE');
        const mappedActiveContacts = activeContacts.map(mapXeroContact);
        await nango.batchSave(mappedActiveContacts, 'Contact');

        // If it is an incremential refresh, mark archived contacts as deleted
        if (nango.lastSyncDate) {
            const archivedContacts = contacts.filter((x: any) => x.ContactStatus === 'ARCHIVED');
            const mappedArchivedContacts = archivedContacts.map(mapXeroContact);
            await nango.batchDelete(mappedArchivedContacts, 'Contact');
        }

        // Should we still fetch the next page?
        page = contacts.length < 100 ? -1 : page + 1;
    } while (page != -1);
}

function mapXeroContact(xeroContact: any): Contact {
    // Find Street address & default phone object, if they exist
    let streetAddress = xeroContact.Addresses.filter((x: any) => x.AddressType === 'POBOX')[0];
    let defaultPhone = xeroContact.Phones.filter((x: any) => x.PhoneType === 'DEFAULT')[0];

    streetAddress = streetAddress ? streetAddress : {};
    defaultPhone = defaultPhone ? defaultPhone : {};

    let formattedPhoneNumber: any = null;
    if (defaultPhone.PhoneNumber) {
        formattedPhoneNumber = defaultPhone.PhoneCountryCode
            ? `+${defaultPhone.PhoneCountryCode}${defaultPhone.PhoneAreaCode}${defaultPhone.PhoneNumber}`
            : `${defaultPhone.PhoneAreaCode}${defaultPhone.PhoneNumber}`;
    }

    return {
        id: xeroContact.ContactID,
        name: xeroContact.Name,
        external_id: xeroContact.ContactNumber,
        tax_number: xeroContact.TaxNumber,
        email: xeroContact.EmailAddress,
        address_line_1: streetAddress.AddressLine1,
        address_line_2: streetAddress.AddressLine2,
        city: streetAddress.City,
        zip: streetAddress.PostalCode,
        country: streetAddress.Country,
        state: streetAddress.Region,
        phone: formattedPhoneNumber
    } as Contact;
}
