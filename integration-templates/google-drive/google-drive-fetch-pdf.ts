import type { NangoAction } from './models';

export default async function runAction(nango: NangoAction, input: string): Promise<string> {
    if (!input || typeof input !== 'string') {
        throw new Error('Missing or invalid input: a pdf id is required and should be a string');
    }

    const response = await nango.get({
        endpoint: `drive/v3/files/${input}`,
        params: {
            alt: 'media'
        },
        responseType: 'stream'
    });

    if (response.status !== 200) {
        throw new Error(`Failed to retrieve file: Status Code ${response.status}`);
    }

    const chunks = [];

    try {
        for await (const chunk of response.data) {
            chunks.push(chunk);
        }
    } catch (streamError: any) {
        throw new Error(`Error during stream processing: ${streamError.message}`);
    }

    const buffer = Buffer.concat(chunks);

    const base64Data = buffer.toString('base64');

    return base64Data;
}
