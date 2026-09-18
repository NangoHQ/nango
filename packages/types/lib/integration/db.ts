import type { TimestampsAndDeleted } from '../db.js';
import type { NullablePartial } from '../utils.js';
import type { SetOptional, Tagged } from 'type-fest';

export interface IntegrationConfig extends TimestampsAndDeleted {
    id?: number | undefined;
    unique_key: string;
    provider: string;
    oauth_client_id: string | null;
    oauth_client_secret: string | null;
    oauth_scopes?: string | undefined | null;
    environment_id: number;
    oauth_client_secret_iv?: string | null;
    oauth_client_secret_tag?: string | null;
    app_link?: string | null | undefined;
    custom?: Record<string, string> | undefined | null;
    missing_fields: string[];
    display_name: string | null;
    forward_webhooks: boolean;
    shared_credentials_id: number | null;
    auto_enable_catalog_actions: boolean;
    /** Absolute per-name enable/disable for live catalog actions */
    catalog_action_overrides: Record<string, boolean>;
}

export type DBIntegrationDecrypted = IntegrationConfig; // TODO: tag this
export type DBIntegrationCrypted = Tagged<IntegrationConfig, 'IntegrationCrypted'>;

export type DBCreateIntegration = SetOptional<
    NullablePartial<Omit<IntegrationConfig, 'created_at' | 'updated_at'>>,
    'missing_fields' | 'auto_enable_catalog_actions' | 'catalog_action_overrides'
>;
