import type { NangoAction, SharePointSiteId } from '../../models';
import type { SharePointMetadata } from '../types';

export default async function runAction(nango: NangoAction): Promise<void> {
    await nango.setMetadata({ sitesToSync: [] });

    const config = {
        endpoint: 'v1.0/sites',
        paginate: {
            type: 'link',
            limit_name_in_request: '$top',
            response_path: 'value',
            link_path_in_response_body: '@odata.nextLink',
            limit: 100
        },
        params: {
            search: '*',
            select: 'id'
        },
        retries: 10
    };

    try {
        for await (const sites of nango.paginate<SharePointSiteId>(config)) {
            const ids: string[] = sites.map(mapSharePointId);
            let metadata: Partial<SharePointMetadata> = (await nango.getMetadata()) || {};
            metadata = {
                ...(metadata as SharePointMetadata),
                sitesToSync: [...(metadata.sitesToSync || []), ...ids]
            };
            await nango.setMetadata(metadata as SharePointMetadata);
        }
    } catch (error) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error}`
        });
    }
}

function mapSharePointId(sharePoint: any): string {
    return sharePoint.id;
}
