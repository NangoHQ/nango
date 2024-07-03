import type { NangoAction, Contact, ContactActionResponse, FailedContact, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';

export default async function runAction(nango: NangoAction, input?: Contact[]): Promise<ContactActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Check if input is an array
    if (!input || !input.length) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `You must pass an array of contacts! Received: ${JSON.stringify(input)}`
        });
    }

    // Check if every contact has at least name set (this is required by Xero)
    const invalidContacts = input.filter((x: any) => !x.name);
    if (invalidContacts.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `Some contacts are missing the name property, which is mandatory in Xero. Affected contacts:\n${JSON.stringify(invalidContacts, null, 4)}`
        });
    }

    const config = {
        endpoint: 'api.xro/2.0/Contacts',
        headers: {
            'xero-tenant-id': tenant_id
        },
        params: {
            summarizeErrors: 'false'
        },
        data: {
            Contacts: input.map(mapContactToXero)
        }
    };

    const res = await nango.post(config);
    const contacts = res.data.Contacts;

    // Check if Xero failed import of any contacts
    const failedContacts = contacts.filter((x: any) => x.HasValidationErrors);
    if (failedContacts.length > 0) {
        await nango.log(
            `Some contacts could not be created in Xero due to validation errors. Note that the remaining contacts (${
                input.length - failedContacts.length
            }) were created successfully. Affected contacts:\n${JSON.stringify(failedContacts, null, 4)}`,
            { level: 'error' }
        );
    }

    const succeededContacts = contacts.filter((x: any) => !x.HasValidationErrors);

    const response = {
        succeededContacts: succeededContacts.map(mapXeroContact),
        failedContacts: failedContacts.map(mapFailedXeroContact)
    } as ContactActionResponse;

    return response;
}

// Maps a Nango Contact to a Xero Contact
function mapContactToXero(contact: Contact) {
    const xeroContact: any = {};

    if (contact.name) {
        xeroContact['Name'] = contact.name;
    }

    if (contact.external_id) {
        xeroContact['ContactNumber'] = contact.external_id;
    }

    if (contact.tax_number) {
        xeroContact['TaxNumber'] = contact.tax_number;
    }

    if (contact.email) {
        xeroContact['EmailAddress'] = contact.email;
    }

    if (contact.phone) {
        xeroContact['Phones'] = [
            {
                PhoneType: 'DEFAULT',
                PhoneNumber: contact.phone
            }
        ];
    }

    if (contact.address_line_1 || contact.address_line_2 || contact.city || contact.zip || contact.country || contact.state) {
        const address: any = { AddressType: 'POBOX' };
        if (contact.address_line_1) {
            address['AddressLine1'] = contact.address_line_1;
        }
        if (contact.address_line_2) {
            address['AddressLine2'] = contact.address_line_2;
        }
        if (contact.city) {
            address['City'] = contact.city;
        }
        if (contact.zip) {
            address['PostalCode'] = contact.zip;
        }
        if (contact.country) {
            address['Country'] = contact.country;
        }
        if (contact.state) {
            address['Region'] = contact.state;
        }

        xeroContact['Addresses'] = [address];
    }

    return xeroContact;
}

function mapFailedXeroContact(xeroContact: any): FailedContact {
    const failedContact = mapXeroContact(xeroContact) as FailedContact;
    failedContact.validation_errors = xeroContact.ValidationErrors;

    return failedContact;
}

function mapXeroContact(xeroContact: any): Contact {
    // Find Street address & default phone object, if they exist
    const streetAddress = xeroContact.Addresses.filter((x: any) => x.AddressType === 'POBOX')[0];
    const defaultPhone = xeroContact.Phones.filter((x: any) => x.PhoneType === 'DEFAULT')[0];

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
