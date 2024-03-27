import type { NangoSync, Contact, ProxyConfiguration } from "./models";

export default async function fetchData(nango: NangoSync): Promise<void> {
  const RETRIES = 10;

  const proxyConfig: ProxyConfiguration = {
    endpoint: "/customer",
    retries: RETRIES,
  };
  for await (const customers of paginate(nango, proxyConfig)) {
    const mapped: Contact[] = [];
    for (const customerLink of customers) {
      const contactRes = await nango.get({
        endpoint: `/customer/${customerLink.id}`,
        retries: RETRIES,
      });
      const contactWithoutAddress = {
        id: contactRes.data.id,
        name: contactRes.data.companyName,
        external_id: contactRes.data.externalId,
        email: contactRes.data.email,
        phone: contactRes.data.phone,
        subsidiary: contactRes.data.subsidiary?.id,
        tax_number: null,
      } as Contact;

      const address = await nango
        .get({
          endpoint: `/customer/${customerLink.id}/addressbook`,
          retries: RETRIES,
        })
        .then((res) => {
          const addressBookIds = res.data.items.map((addressLink: any) => {
            return addressLink.links
              ?.find((link: any) => link.rel === "self")
              .href.match(/\/addressBook\/(\d+)/)?.[1];
          });
          if (addressBookIds.length > 0) {
            return nango
              .get({
                endpoint: `/customer/${customerLink.id}/addressBook/${addressBookIds[0]}/addressBookAddress`,
                retries: RETRIES,
              })
              .then((res) => {
                return {
                  address_line_1: res.data.addr1,
                  address_line_2: res.data.addr2,
                  city: res.data.city,
                  zip: res.data.zip,
                  country: res.data.country?.refName,
                  state: res.data.state?.id,
                };
              });
          }
          return null;
        });
      const contact: Contact = {
        ...contactWithoutAddress,
        ...address,
      };
      mapped.push(contact);
    }
    await nango.batchSave<Contact>(mapped, "Contact");
  }
}

async function* paginate(
  nango: NangoSync,
  proxyConfig: ProxyConfiguration
): AsyncGenerator<any[]> {
  const limit = 100;
  const config: ProxyConfiguration =
    typeof proxyConfig.params === "string"
      ? { ...proxyConfig, params: { limit } }
      : { ...proxyConfig, params: { ...proxyConfig.params, limit } };
  while (true) {
    const res = await nango.get(config);
    yield res.data?.items || [];

    if (res.data?.hasMore) {
      const next = res.data?.links?.find(
        (link: { rel: string; href: string }) => link.rel === "next"
      )?.href;
      const offset = next.match(/offset=(\d+)/)?.[1];
      if (!offset) break;
      config.params = { limit, offset };
    } else {
      break;
    }
  }
}
