import type { NangoSync, Sale } from "./models";

export default async function fetchData(nango: NangoSync): Promise<{ Sale: Sale[] }> {
  // Integration code goes here, be sure to follow the return signature type
  const backfillPeriod = new Date(Date.now() - 24 * 60 * 60 * 1000 * 30); // 24 hours ago.
  const { lastSyncDate } = nango;
  const syncDate = lastSyncDate || backfillPeriod;

  // Get all deals
  const filters = {
    status: "won",
  };
  const deals = (await paginate(nango, "/v1/deals", filters)).filter(
    (deal) => new Date(deal.update_time) > syncDate
  );

  let mappedDeals: Sale[] = [];

  for (let deal of deals) {
    if (deal && deal.user_id) {
      mappedDeals.push({
        id: deal.id,
        amount: deal.value,
        datetime: deal.won_time,
        user_id: deal.user_id.id,
      });
    }
    if (mappedDeals.length > 49) {
      await nango.batchSave(mappedDeals, "Sale");
      mappedDeals = [];
    }
  }

  if (mappedDeals.length > 0) {
    await nango.batchSave(mappedDeals, "Sale");
  }

  return { Sale: [] };
}

async function paginate(
  nango: NangoSync,
  endpoint: string,
  queryParams?: Record<string, string | string[]>
) {
  const MAX_PAGE = 100;
  let results: any[] = [];
  let start = 0;
  while (true) {
    const resp = await nango.get({
      endpoint: endpoint,
      baseUrlOverride: "https://api.pipedrive.com",
      params: {
        start: `${start}`,
        limit: `${MAX_PAGE}`,
        ...queryParams,
      },
    });

    results = results.concat(resp.data.data);

    if (resp.data.additional_data.pagination.more_items_in_collection) {
      start = resp.data.additional_data.pagination.next_start;
    } else {
      break;
    }
  }

  return results;
}
