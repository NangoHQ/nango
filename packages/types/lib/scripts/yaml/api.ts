import type { EndpointMethod } from '../../api.js';

export type NangoSyncEndpoint = {
    [key in EndpointMethod]?: string;
};
