import type { NangoSync, KustomerConversation } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/conversations';
        const config = {
            paginate: {
                type: 'link',
                link_path_in_response_body: 'links.next',
                limit_name_in_request: 'pageSize',
                response_path: 'data',
                limit: 100
            }
        };
        for await (const conversation of nango.paginate({ ...config, endpoint })) {
            const mappedConversation: KustomerConversation[] = conversation.map(mapConversation) || [];

            const batchSize: number = mappedConversation.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} conversation(s) (total conversation(s): ${totalRecords})`);
            await nango.batchSave(mappedConversation, 'KustomerConversation');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapConversation(conversation: any): KustomerConversation {
    return {
        type: conversation.type,
        id: conversation.id,
        attributes: conversation.attributes,
        relationships: conversation.relationships,
        links: conversation.links
    };
}
