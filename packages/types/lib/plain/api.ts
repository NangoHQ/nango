import type { Endpoint } from '../api.js';

export type GetPlainHmac = Endpoint<{
    Method: 'GET';
    Path: `/api/v1/plain/hmac`;
    Success: { data: { hash: string } };
}>;
