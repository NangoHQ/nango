import type { Endpoint } from '../api';
import type { StandardNangoConfig } from '../flow';

export type GetPublicScriptsConfig = Endpoint<{
    Method: 'GET';
    Path: `/scripts/config`;
    Success: StandardNangoConfig[];
}>;
