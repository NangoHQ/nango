import type { NangoSync, Sale } from "./models";

export default async function fetchData(nango: NangoSync): Promise<{ Sale: Sale[] }> {
  const backfillPeriod = new Date(Date.now() - 24 * 60 * 60 * 1000 * 30); // 24 hours ago.
  const { lastSyncDate } = nango;
  const syncDate = lastSyncDate || backfillPeriod;

  // Get all deals
  const deals = await paginateHubspotDeals(nango, syncDate);

  let mappedDeals: Sale[] = [];

  for (let deal of deals) {
    if (deal && deal.properties.hubspot_owner_id) {
      mappedDeals.push({
        id: deal.id,
        amount: parseFloat(deal.properties.amount),
        datetime: deal.properties.closedate,
        user_id: deal.properties.hubspot_owner_id,
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

async function paginateHubspotDeals(nango: NangoSync, syncDate: Date) {
  const MAX_PAGE = 100;
  let results: any[] = [];
  let after: string | undefined;

  while (true) {
    const endpoint = `/crm/v3/objects/deals?limit=${MAX_PAGE}&properties=hubspot_owner_id&properties=amount&properties=closedate&properties=dealname&archived=false${after ? `&after=${after}` : ''}`;
    const resp = await nango.get({ 
        endpoint: endpoint,
        baseUrlOverride: "https://api.hubapi.com",
     });

    results = results.concat(resp.data.results.filter((deal: any) => new Date(deal.properties.closedate) > syncDate));

    if (resp.data.paging && resp.data.paging.next) {
      after = resp.data.paging.next.after;
    } else {
      break;
    }
  }

  return results;
}
