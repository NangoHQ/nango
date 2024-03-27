import type { NangoSync, Account, ProxyConfiguration } from "./models";

export default async function fetchData(nango: NangoSync): Promise<void> {
  const RETRIES = 10;
  const proxyConfig: ProxyConfiguration = {
    endpoint: "/account",
    retries: RETRIES,
  };
  for await (const accounts of paginate(nango, proxyConfig)) {
    const mapped: Account[] = [];
    for (const accountLink of accounts) {
      const account = await nango
        .get({ endpoint: `/account/${accountLink.id}`, retries: RETRIES })
        .then((res) => {
          return {
            id: res.data.id,
            code: res.data.acctNumber,
            name: res.data.acctName,
            type: res.data.acctType?.id,
            description: null,
          } as Account;
        });
      mapped.push(account);
    }
    await nango.batchSave<Account>(mapped, "Account");
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
