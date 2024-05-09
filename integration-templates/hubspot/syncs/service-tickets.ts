import type { NangoSync, HubspotServiceTicket } from '../../models';

interface PayloadData {
    properties: string[];
    limit: string;
    after?: string | null;
    sorts: {
        propertyName: string;
        direction: string;
    }[];
    filterGroups: {
        filters: {
            propertyName: string;
            operator: string;
            value: any;
        }[];
    }[];
}

interface Payload {
    endpoint: string;
    data: PayloadData;
}

export default async function fetchData(nango: NangoSync) {
    const MAX_PAGE = 100;
    const TICKET_PROPERTIES = ['hubspot_owner_id', 'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority', 'hs_ticket_category', 'subject', 'content'];

    let afterLink = null;
    const lastSyncDate = nango.lastSyncDate?.toISOString().slice(0, -8).replace('T', ' ');
    const queryDate = lastSyncDate ? Date.parse(lastSyncDate) : Date.now() - 86400000;

    while (true) {
        const payload: Payload = {
            endpoint: '/crm/v3/objects/tickets/search',
            data: {
                sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
                properties: TICKET_PROPERTIES,
                filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GT', value: queryDate }] }],
                limit: `${MAX_PAGE}`,
                after: afterLink
            }
        };

        try {
            const response = await nango.post(payload);
            const pageData = response.data.results;

            const mappedTickets: HubspotServiceTicket[] = pageData.map((ticket: any) => {
                const { id, createdAt, archived } = ticket;
                const { subject, content, hs_object_id, hubspot_owner_id, hs_pipeline, hs_pipeline_stage, hs_ticket_category, hs_ticket_priority } =
                    ticket.properties;

                return {
                    id,
                    createdAt,
                    updatedAt: ticket.properties.hs_lastmodifieddate,
                    archived,
                    subject,
                    content,
                    objectId: hs_object_id,
                    ownerId: hubspot_owner_id,
                    pipelineName: hs_pipeline,
                    pipelineStage: hs_pipeline_stage,
                    category: hs_ticket_category,
                    priority: hs_ticket_priority
                };
            });

            if (mappedTickets.length > 0) {
                await nango.batchSave<HubspotServiceTicket>(mappedTickets, 'HubspotServiceTicket');
                await nango.log(`Sent ${mappedTickets.length}`);
            }

            if (response.data.paging?.next?.after) {
                afterLink = response.data.paging.next.after;
            } else {
                break;
            }
        } catch (error: any) {
            throw new Error(`Error in fetchData: ${error.message}`);
        }
    }
}
