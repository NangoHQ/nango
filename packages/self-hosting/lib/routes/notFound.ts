import type { ApiError } from '@nangohq/types';
import type { Request, Response } from 'express';

export function notFound(_req: Request, res: Response<ApiError<'not_found'>>): void {
    res.status(404).json({ error: { code: 'not_found' } });
}
