export interface GoogleDriveFileResponse {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
}

export interface Metadata {
    files?: string[];
    folders?: string[];
}

interface MimeTypeMapping {
    mimeType: string;
    responseType: 'text' | 'stream';
}

export const mimeTypeMapping: Record<string, MimeTypeMapping> = {
    // Documents
    'application/vnd.google-apps.document': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', responseType: 'text' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        responseType: 'stream'
    },
    'application/vnd.oasis.opendocument.text': { mimeType: 'application/vnd.oasis.opendocument.text', responseType: 'stream' },
    'application/rtf': { mimeType: 'application/rtf', responseType: 'stream' },
    'text/plain': { mimeType: 'text/plain', responseType: 'stream' },
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
