import bytes from 'bytes';
import multer from 'multer';

import type { Request } from 'express';
import type { Writable } from 'node:stream';

type ExtendedMulterOptions = multer.Options & {
    limits?: multer.Options['limits'] & { fieldNestingDepth?: number };
    streamHandler?: (req: Request, busboy: Writable) => void;
};

/**
 * Same shape as body-parser's error so the router's error handler answers 413 for it.
 */
function entityTooLarge(limit: number, length?: number): Error {
    return Object.assign(new Error('request entity too large'), {
        type: 'entity.too.large',
        status: 413,
        statusCode: 413,
        expose: true,
        limit,
        ...(length !== undefined ? { length, expected: length } : {})
    });
}

/**
 * Multer keeps every file in memory and has no limit on the size of the whole body, so the request
 * stream is capped at `limit` bytes before busboy sees it, like the JSON and raw parsers.
 */
export function multipartBodyParser(limit: string | number) {
    const maxBytes = typeof limit === 'number' ? limit : bytes.parse(limit);
    if (maxBytes === null || !Number.isFinite(maxBytes) || maxBytes < 0) {
        throw new Error(`Invalid multipart body limit: ${limit}`);
    }

    const options: ExtendedMulterOptions = {
        storage: multer.memoryStorage(),
        limits: { fieldNestingDepth: 50 },
        streamHandler: (req, busboy) => {
            const declared = req.headers['content-length'] ? Number(req.headers['content-length']) : undefined;
            if (declared !== undefined && declared > maxBytes) {
                busboy.destroy(entityTooLarge(maxBytes, declared));
                return;
            }

            let received = 0;
            const onData = (chunk: Buffer) => {
                received += chunk.length;
                if (received > maxBytes) {
                    req.removeListener('data', onData);
                    req.unpipe(busboy);
                    busboy.destroy(entityTooLarge(maxBytes, declared));
                }
            };
            // Registered before pipe() so an oversized chunk is caught before busboy parses it.
            req.on('data', onData);
            req.pipe(busboy);
        }
    };

    return multer(options as multer.Options);
}
