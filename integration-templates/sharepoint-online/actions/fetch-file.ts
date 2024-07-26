import type { NangoAction, FetchFile, FetchFileInput } from '../../models';
import type { SharepointFetchFile } from '../types';

/**
 * Fetches the latest file download URL from SharePoint, which can be used to download the actual file by making an XMLHttpRequest.
 * @param nango - The NangoAction instance used to interact with the external API.
 * @param input - Object containing siteId and itemId.
 * @returns A Promise that resolves with the FetchFile.
 */
export default async function runAction(nango: NangoAction, input: FetchFileInput): Promise<FetchFile> {
    validate(nango, input);

    const response = await nango.get<SharepointFetchFile>({
        endpoint: `/v1.0/sites/${input.siteId}/drive/items/${input.itemId}`,
        params: {
            select: 'id, @microsoft.graph.downloadUrl'
        }
    });

    return {
        id: response.data.id,
        download_url: response.data['@microsoft.graph.downloadUrl'] ?? null
    };
}

/**
 * Validates the input to ensure it contains the required fields.
 * @param nango - The NangoAction instance used for error handling.
 * @param input - The input to validate.
 */
function validate(nango: NangoAction, input: FetchFileInput) {
    if (!input.siteId) {
        throw new nango.ActionError({
            message: 'Missing required parameter: siteId'
        });
    }

    if (!input.itemId) {
        throw new nango.ActionError({
            message: 'Missing required parameter: itemId'
        });
    }
}
