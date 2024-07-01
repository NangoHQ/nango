import type { Contact } from '../../models';
import type { UnanetContact } from '../types';

export function toContact(unanetContact: UnanetContact, input: Contact): Contact {
    if (!unanetContact.ContactId) {
        throw new Error('LeadId is required');
    }

    const [address] = unanetContact.Addresses || [{ OfficePhone: input.phone, OfficeFax: input.fax }];

    const contact: Contact = {
        id: unanetContact.ContactId?.toString(),
        firstName: unanetContact.FirstName,
        lastName: unanetContact.LastName,
        position: unanetContact.Title || '',
        emailAddress: unanetContact.Email || '',
        phone: address?.OfficePhone || '',
        fax: address?.OfficeFax || '',
        federalAgency: input.federalAgency
    };

    return contact;
}
