import { createHash } from 'node:crypto';

export function contentMd5Hex(content: string): string {
    return createHash('md5').update(content, 'utf8').digest('hex');
}

export function contentMd5Base64(content: string): string {
    return createHash('md5').update(content, 'utf8').digest('base64');
}

export function contentMd5Digest(content: string): Buffer {
    return createHash('md5').update(content, 'utf8').digest();
}

export function etagMatchesContent(etag: string | undefined, content: string): boolean {
    if (!etag) {
        return false;
    }
    return etag.replace(/"/g, '') === contentMd5Hex(content);
}
