import type { NangoSync, Document } from '../../models';

interface GoogleDriveFileResponse {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
}
interface Metadata {
    files?: string[];
    folders?: string[];
}
// Mapping MIME types to their export MIME type and response type
const mimeTypeMapping: Record<string, { mimeType: string; responseType: 'text' | 'stream' }> = {
    // Documents
    'application/vnd.google-apps.document': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', responseType: 'text' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        responseType: 'stream'
    },
    'application/vnd.oasis.opendocument.text': { mimeType: 'application/vnd.oasis.opendocument.text', responseType: 'stream' },
    'application/rtf': { mimeType: 'application/rtf', responseType: 'stream' },
    'text/plain': { mimeType: 'text/plain', responseType: 'text' },
    // Spreadsheets
    'application/vnd.google-apps.spreadsheet': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', responseType: 'text' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        responseType: 'stream'
    },
    'application/vnd.oasis.opendocument.spreadsheet': { mimeType: 'application/vnd.oasis.opendocument.spreadsheet', responseType: 'stream' },
    // PDFs
    'application/pdf': { mimeType: 'application/pdf', responseType: 'stream' },
    // Text Files
    'text/csv': { mimeType: 'text/csv', responseType: 'text' },
    'text/tab-separated-values': { mimeType: 'text/tab-separated-values', responseType: 'text' },
    // Presentations
    'application/vnd.google-apps.presentation': { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', responseType: 'text' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        responseType: 'stream'
    },
    'application/vnd.oasis.opendocument.presentation': { mimeType: 'application/vnd.oasis.opendocument.presentation', responseType: 'stream' },
    // Drawings and Images
    'application/vnd.google-apps.drawing': { mimeType: 'image/jpeg', responseType: 'stream' },
    'image/jpeg': { mimeType: 'image/jpeg', responseType: 'stream' },
    'image/png': { mimeType: 'image/png', responseType: 'stream' },
    'image/svg+xml': { mimeType: 'image/svg+xml', responseType: 'stream' }
};
export default async function fetchData(nango: NangoSync): Promise<void> {
    const metadata = await nango.getMetadata<Metadata>();
    if (!metadata || (!metadata.files && !metadata.folders)) {
        throw new Error('Metadata for files or folders is required.');
    }
    const initialFolders = metadata?.folders ? [...metadata.folders] : [];
    const processedFolders = new Set<string>();
    const batchSize = 100;
    let batch: Document[] = [];
    // Recursive function to process files in a folder
    async function processFolder(folderId: string) {
        if (processedFolders.has(folderId)) return;
        processedFolders.add(folderId);
        const query = `('${folderId}' in parents) and trashed = false`;
        const proxyConfiguration = {
            endpoint: `drive/v3/files`,
            params: {
                fields: 'files(id, name, mimeType, webViewLink, parents), nextPageToken',
                pageSize: batchSize.toString(),
                q: query
            },
            paginate: {
                response_path: 'files'
            }
        };
        for await (const files of nango.paginate<GoogleDriveFileResponse>(proxyConfiguration)) {
            for (const file of files) {
                if (file.mimeType === 'application/vnd.google-apps.folder') {
                    await processFolder(file.id);
                } else {
                    await processFile(file);
                }
            }
        }
    }
    // Function to process individual files
    async function processFile(file: GoogleDriveFileResponse) {
        const content = await fetchDocumentContent(nango, file);
        batch.push({
            id: file.id,
            url: file.webViewLink,
            content: content ?? '',
            title: file.name
        });
        if (batch.length === batchSize) {
            await nango.batchSave<Document>(batch, 'Document');
            batch = [];
        }
    }
    // Process initial folders
    for (const folderId of initialFolders) {
        await processFolder(folderId);
    }
    // Process individual files
    if (metadata?.files) {
        for (const file of metadata.files) {
            try {
                const documentResponse = await nango.get({
                    endpoint: `drive/v3/files/${file}`,
                    params: {
                        fields: 'id, name, mimeType, webViewLink, parents'
                    }
                });
                await processFile(documentResponse.data);
            } catch (e) {
                await nango.log(`Error fetching file ${file}: ${e}`);
            }
        }
    }
    // Save remaining batch
    if (batch.length > 0) {
        await nango.batchSave<Document>(batch, 'Document');
    }
}

async function fetchDocumentContent(nango: NangoSync, doc: GoogleDriveFileResponse): Promise<string | null> {
    try {
        const mapping = mimeTypeMapping[doc.mimeType];
        if (!mapping) {
            await nango.log(`Unsupported MIME type for content extraction: ${doc.mimeType}`);
            return null;
        }
        const { responseType, mimeType: exportMimeType } = mapping;
        return await fetchFileContent(nango, doc.id, exportMimeType, responseType);
    } catch (e) {
        await nango.log(`Error fetching content for ${doc.name}: ${e}`);
        return null;
    }
}

async function fetchFileContent(nango: NangoSync, fileId: string, mimeType: string, responseType: 'text' | 'stream'): Promise<string | null> {
    try {
        const endpoint = responseType === 'text' ? `drive/v3/files/${fileId}/export` : `drive/v3/files/${fileId}`;
        const params = responseType === 'text' ? { mimeType } : { alt: 'media' };
        const response = await nango.get({
            endpoint,
            params,
            responseType
        });
        if (responseType === 'text') {
            return response.data ?? null;
        } else {
            const chunks: Buffer[] = [];
            for await (const chunk of response.data) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            return buffer.toString('base64');
        }
    } catch (e) {
        await nango.log(`Error fetching content for file ${fileId}: ${e}`);
        return null;
    }
}
