import type { FileMetadata } from '../../models';
import type { DriveItem } from '../types';

/**
 * Converts a DriveItem object to a slim FileMetadata object.
 * Only includes essential properties mapped from DriveItem.
 * @param file The DriveItem object to convert.
 * @returns FileMetadata object representing file metadata.
 */
export function toFile(file: DriveItem, siteId: string): FileMetadata {
    const fileMetadata: FileMetadata = {
        siteId: siteId,
        id: file.id,
        etag: file.eTag,
        cTag: file.cTag,
        name: file.name,
        is_folder: 'folder' in file,
        mime_type: file.file?.mimeType ?? null,
        path: file.parentReference.path,
        raw_source: file,
        updated_at: new Date(file.lastModifiedDateTime).toISOString(),
        download_url: file['@microsoft.graph.downloadUrl'] ?? null,
        created_at: new Date(file.createdDateTime).toISOString(),
        blob_size: file.size
    };
    return fileMetadata;
}
