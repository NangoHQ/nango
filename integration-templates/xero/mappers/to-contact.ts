import type { Contact } from '../../models';

export function toContact(xeroContact: any): Contact {
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

export function toXeroContact(contact: Contact) {
    const xeroContact: any = {};

    if (contact.id) {
        xeroContact['ContactID'] = contact.id;
    }

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
