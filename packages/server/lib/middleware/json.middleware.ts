import type { RequestHandler } from 'express';

export const jsonContentTypeMiddleware: RequestHandler = (req, res, next) => {
    if (req.headers['content-type'] && req.headers['content-type'] !== 'application/json') {
        // Send error here
        res.status(415).json({ error: { code: 'invalid_content_type', message: 'Header Content-Type must be application/json' } });
        return;
    }

    next();
};
