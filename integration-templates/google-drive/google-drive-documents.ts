import type { NangoSync, Document } from './models';

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

const mimeTypeMapping: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
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

    async function processFolder(folderId: string) {
        if (processedFolders.has(folderId)) return;
        processedFolders.add(folderId);

        const query = `('${folderId}' in parents) and trashed = false`;
        const proxyConfiguration = {
            endpoint: `drive/v3/files`,
            params: {
                fields: 'files(id, name, mimeType, webViewLink, parents)',
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
                } else if (file.mimeType === 'application/vnd.google-apps.document' || file.mimeType === 'application/pdf') {
                    const content = await fetchDocumentContent(nango, file, file.mimeType);
                    batch.push({
                        id: file.id,
                        url: file.webViewLink,
                        content: content || '',
                        title: file.name
                    });

                    if (batch.length === batchSize) {
                        await nango.batchSave<Document>(batch, 'Document');
                        batch = [];
                    }
                }
            }
        }
    }

    for (const folderId of initialFolders) {
        await processFolder(folderId);
    }

    if (metadata?.files) {
        for (const file of metadata.files) {
            try {
                const documentResponse = await nango.get({
                    endpoint: `drive/v3/files/${file}`,
                    params: {
                        fields: 'id, name, mimeType, webViewLink, parents'
                    }
                });
                const content = await fetchDocumentContent(nango, documentResponse.data, documentResponse.data.mimeType);

                batch.push({
                    id: documentResponse.data.id,
                    url: documentResponse.data.webViewLink,
                    content: content || '',
                    title: documentResponse.data.name
                });

                if (batch.length === batchSize) {
                    await nango.batchSave<Document>(batch, 'Document');
                    batch = [];
                }
            } catch (e) {
                await nango.log(`Error fetching file ${file}: ${e}`);
            }
        }
    }

    if (batch.length > 0) {
        await nango.batchSave<Document>(batch, 'Document');
    }
}

async function fetchDocumentContent(nango: NangoSync, doc: GoogleDriveFileResponse, mimeType: string): Promise<string | null> {
    try {
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
            const contentResponse = await nango.get({
                endpoint: `drive/v3/files/${doc.id}/export`,
                params: {
                    mimeType: 'text/csv'
                },
                responseType: 'text'
            });
            return contentResponse.data;
        } else if (mimeType === 'application/pdf') {
            return '';
        } else {
            const exportType = mimeTypeMapping[mimeType] || 'text/plain';
            const contentResponse = await nango.get({
                endpoint: `drive/v3/files/${doc.id}/export`,
                params: {
                    mimeType: exportType
                }
            });

            return contentResponse.data;
        }
    } catch (e) {
        await nango.log(`Error fetching content for ${doc.name}: ${e}`);
        return null;
    }
}
