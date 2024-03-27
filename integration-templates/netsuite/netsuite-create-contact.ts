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
      .post({
        endpoint: "/customer",
        data: netsuiteCustomer,
      })
      .then((res) => {
        const id = res.headers.location?.split("/").pop();
        if (!id) {
          throw new Error("Could not parse 'id' from Netsuite API response");
        }
        response.succeededContacts.push({ ...contact, id });
      })
      .catch((err) => {
        const details = err.response?.data["o:errorDetails"]?.map(
          (detail: { detail: string }) => detail.detail
        ) || [err.message];
        const failedContact: FailedContact = {
          ...contact,
          validation_errors: details,
        };
        response.failedContacts.push(failedContact);
      });
  }
  return response;
}
