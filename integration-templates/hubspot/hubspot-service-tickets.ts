import type { NangoSync, HubspotServiceTicket } from './models';

export default async function fetchData(nango: NangoSync) {
    const MAX_PAGE = 100;

    let page = 1;
    let afterLink = null;

    let lastSyncDate = nango.lastSyncDate?.toISOString().slice(0, -8).replace('T', ' ');
    let queryDate = Date.now() - 86400000;

    if (lastSyncDate) {
        queryDate = Date.parse(lastSyncDate);
    }

    while (true) {
        let payload = {
            endpoint: '/crm/v3/objects/tickets/search',
            params: {
                limit: `${MAX_PAGE}`
            } as Params,
            data: {
                sorts: [
                    {
                        propertyName: 'hs_lastmodifieddate',
                        direction: 'DESCENDING'
                    }
                ],
                properties: [
                    // Define a list of these properties otherwise Hubspot won't return the Owner ID.
                    'hubspot_owner_id',
                    'hs_pipeline',
                    'hs_pipeline_stage',
                    'hs_ticket_priority',
                    'hs_ticket_category',
                    'subject',
                    'content'
                ],
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'hs_lastmodifieddate',
                                operator: 'GT',
                                value: queryDate
                            }
                        ]
                    }
                ]
            }
        };

        if (!afterLink) {
            payload.params['after'] = afterLink;
        }

        const response = await nango.post(payload);

        let pageData = response.data.results;

        const mappedTickets: HubspotServiceTicket[] = pageData.map((ticket) => ({
            id: ticket.id,
            createdAt: ticket.createdAt,
            updatedAt: ticket.properties.hs_lastmodifieddate,
            archived: ticket.archived,
            subject: ticket.properties.subject,
            content: ticket.properties.content,
            objectId: ticket.properties.hs_object_id,
            ownerId: ticket.properties.hubspot_owner_id,
            pipelineName: ticket.properties.hs_pipeline,
            pipelineStage: ticket.properties.hs_pipeline_stage,
            category: ticket.properties.hs_ticket_category,
            priority: ticket.properties.hs_ticket_priority
        }));

        if (mappedTickets.length > 0) {
            await nango.batchSave<HubspotServiceTicket>(mappedTickets, 'HubspotServiceTicket');
            await nango.log(`Sent ${mappedTickets.length}`);
        }

        if (response.data.length == MAX_PAGE) {
            page += 1;
            afterLink = response.data.paging.next.after;
        } else {
            break;
        }
    }
}

interface Params {
    limit: string;
    [key: string]: any; // Allows additional properties
}
