import type { Endpoint } from '../api';

export type GetAsyncActionResult = Endpoint<{
    Method: 'GET';
    Path: `/action/:id`;
    Params: {
        id: string;
    };
    // This endpoint can actually return any json value (not just object)
    // but Endpoint definition is not flexible enough to support that.
    // TODO: fix Endpoint definition to support any json value
    Success: Record<string, any>;
}>;
