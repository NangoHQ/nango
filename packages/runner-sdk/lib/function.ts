import { NangoSyncBase } from './sync.js';

import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { ApiPublicConnection } from '@nangohq/types';

/**
 * The SDK surface a function `exec` receives. Functions are trigger-driven and may
 * be connection-bound or connection-less, so they get a few methods that do not belong
 * on syncs or actions. It extends the sync surface so functions keep
 * `batchSave`/`batchUpdate`/`batchDelete` against their declared models.
 */
export abstract class NangoFunctionBase<
    TModels extends Record<string, ZodModel> = never,
    TMetadata extends ZodMetadata = never,
    TCheckpoint extends ZodCheckpoint = never
> extends NangoSyncBase<TModels, TMetadata, TCheckpoint> {
    /**
     * Search this integration's connections that this function can route to.
     *
     * Used by connection-less function runs (e.g. an integration-level webhook) to find the
     * connection(s) an incoming event targets, before fanning out work to them.
     *
     * @example
     * ```ts
     * const connections = await nango.searchConnections({ tags: { portalId: '12345' } });
     * for (const connection of connections) {
     *     await nango.triggerSync(this.providerConfigKey, connection.connection_id, 'contacts');
     * }
     * ```
     */
    public async searchConnections(filter: { tags: Record<string, string> }): Promise<ApiPublicConnection[]> {
        this.throwIfAbortedOrKilled();

        const { connections } = await this.nango.listConnections({
            tags: filter.tags,
            integrationId: this.providerConfigKey
        });
        return connections;
    }

    /**
     * Drop the current event cleanly. The reason is written to the run's activity log so the
     * decision is visible, without surfacing as an error.
     *
     * @example
     * ```ts
     * if (connections.length === 0) {
     *     await nango.ignore('no matching connection');
     *     return;
     * }
     * ```
     */
    public async ignore(reason?: string): Promise<void> {
        await this.log(reason ? `Event ignored: ${reason}` : 'Event ignored', { level: 'info' });
    }
}
