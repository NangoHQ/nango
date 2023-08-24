import type { NangoSync, HubspotServiceTicket } from './models';

export default async function fetchData(nango: NangoSync): Promise<{HubspotServiceTicket: HubspotServiceTicket[]}> {
    const tickets = await paginate(nango, '/crm/v3/objects/tickets/search');

    const mappedTickets: HubspotServiceTicket[] = tickets.map(ticket => ({
        id: ticket.id,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        archived: ticket.archived,
        properties: {
            content: ticket.properties.content,
            createdate: ticket.properties.createdate,
            hs_lastmodifieddate: ticket.properties.hs_lastmodifieddate,
            hs_object_id: ticket.properties.hs_object_id,
            hs_pipeline: ticket.properties.hs_pipeline,
            hs_pipeline_stage: ticket.properties.hs_pipeline_stage,
            hs_ticket_category: ticket.properties.hs_ticket_category,
            hs_ticket_priority: ticket.properties.hs_ticket_priority,
            subject: ticket.properties.subject
        }
    }));

    if (mappedTickets.length > 0) {
        await nango.batchSave<HubspotServiceTicket>(mappedTickets, 'HubspotServiceTicket');
        await nango.log(`Sent ${mappedTickets.length}`);
    }

    return { HubspotServiceTicket: [] };
}

interface Params {
    limit: string;
    [key: string]: any; // Allows additional properties
}

async function paginate(nango: NangoSync, endpoint: string) {
    const MAX_PAGE = 100;

    let results: any[] = [];
    let page = 1;
    let afterLink = null;

    let lastSyncDate = nango.lastSyncDate?.toISOString().slice(0, -8).replace('T', ' ')
    let queryDate = Date.now() - 86400000;

    if (lastSyncDate) {
        queryDate = Date.parse(lastSyncDate);
    }

    while (true) {
        let payload = {
            endpoint: endpoint,
            params: {
                limit: `${MAX_PAGE}`,
            } as Params,
            data: {
                sorts: [
                    {
                        propertyName: 'hs_lastmodifieddate',
                        direction: 'DESCENDING'
                    }
                ],
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'hs_lastmodifieddate',
                                operator: 'GT',
                                value: queryDate,
                            },
                        ],
                    },
                ],
            },
        };

        if ( ! afterLink) {
            payload.params['after'] = afterLink;
        }

        const response = await nango.post(payload);

        results = results.concat(response.data.results);

        if (response.data.length == MAX_PAGE) {
            page += 1;
            afterLink = response.data.paging.next.after;
        } else {
            break;
        }
    }

    return results;
}
