import type { NangoAction, ProxyConfiguration } from '../../models';
import type { GoogleDriveFileResponse } from '../types.js';
import { mimeTypeMapping } from '../types.js';

/**
 * Retrieves and returns the content of a Google Drive file as a base64-encoded string.
 *
 * For detailed endpoint documentation, refer to:
 *
 * https://developers.google.com/drive/api/reference/rest/v3/files/get
 * https://developers.google.com/drive/api/reference/rest/v3/files/export
 * @param nango - An instance of NangoAction used for making API requests.
 * @param input - The ID of the file to be retrieved, provided as a string.
 * @returns The base64-encoded content of the file.
 * @throws Error if the input is invalid, or if the file metadata or content retrieval fails.
 */
export default async function runAction(nango: NangoAction, input: string): Promise<string> {
    if (!input || typeof input !== 'string') {
        throw new Error('Missing or invalid input: a file ID is required and should be a string');
    }

    // Fetch the file metadata first to get the MIME type
    const Config: ProxyConfiguration = {
        endpoint: `drive/v3/files/${input}`,
        params: {
            fields: 'id, name, mimeType'
        }
    };
    const fileMetadataResponse = await nango.get<GoogleDriveFileResponse>(Config);

    if (fileMetadataResponse.status !== 200 || !fileMetadataResponse.data) {
        throw new Error(`Failed to retrieve file metadata: Status Code ${fileMetadataResponse.status}`);
    }

    const file = fileMetadataResponse.data;
    const mimeTypeDetails = mimeTypeMapping[file.mimeType];

    if (!mimeTypeDetails) {
        throw new Error(`Unsupported MIME type: ${file.mimeType}`);
    }

    const { mimeType: exportMimeType, responseType } = mimeTypeDetails;

    await nango.log('Fetching document of ', { exportMimeType });

    const endpoint = responseType === 'text' ? `drive/v3/files/${file.id}/export` : `drive/v3/files/${file.id}`;
    const params = responseType === 'text' ? { mimeType: exportMimeType } : { alt: 'media' };

    const config: ProxyConfiguration = {
        endpoint,
        params,
        responseType
    };
    const response = await nango.get(config);

    if (response.status !== 200) {
        throw new Error(`Failed to retrieve file content: Status Code ${response.status}`);
    }

    if (responseType === 'text') {
        return response.data ?? '';
    } else {
        const chunks: Buffer[] = [];
        for await (const chunk of response.data) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        return buffer.toString('base64');
    }
}
