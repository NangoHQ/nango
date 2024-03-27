import type {
  NangoAction,
  Contact,
  ContactActionResponse,
  FailedContact,
} from "./models";

export default async function runAction(
  nango: NangoAction,
  input?: Contact[]
): Promise<ContactActionResponse> {
  const response: ContactActionResponse = {
    succeededContacts: [],
    failedContacts: [],
  };
  if (!input?.length) {
    throw new Error(
      `You must pass an array of contacts! Received: ${JSON.stringify(input)}`
    );
  }
  for (const contact of input) {
    const netsuiteCustomer = {
      externalId: contact.external_id,
      email: contact.email,
      phone: contact.phone,
      companyName: contact.name,
      subsidiary: contact.subsidiary,
      addressbook: {
        items: [
          {
            addressbookaddress: {
              addr1: contact.address_line_1,
              addr2: contact.address_line_2,
              city: contact.city,
              zip: contact.zip,
              state: contact.state,
              country: {
                refName: contact.country,
              },
            },
          },
        ],
      },
    };
    await nango
      .patch({
        endpoint: `/customer/${contact.id}?replace=addressBook`,
        data: netsuiteCustomer,
      })
      .then((_) => {
        response.succeededContacts.push(contact);
      })
      .catch((errorRes) => {
        const details = errorRes.response?.data["o:errorDetails"]?.map(
          (detail: { detail: string }) => detail.detail
        ) || ["Unknown error"];
        const failedContact: FailedContact = {
          ...contact,
          validation_errors: details,
        };
        response.failedContacts.push(failedContact);
      });
  }
  return response;
}
