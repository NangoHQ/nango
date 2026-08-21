import { describe, expect, it } from 'vitest';

import { mapDeprecatedConnectionConfigWebhookUrl } from './mapDeprecatedConnectionConfigWebhookUrl.js';

describe('mapDeprecatedConnectionConfigWebhookUrl', () => {
    it('leaves the body unchanged when there are no integrations_config_defaults', () => {
        const body = { webhook_url_override: 'https://example.com/hook', end_user: { id: '1' } };
        expect(mapDeprecatedConnectionConfigWebhookUrl(body)).toEqual({ ok: true, body });
    });

    it('hoists deprecated nested webhook_url onto webhook_url_override and strips it from connection_config', () => {
        const result = mapDeprecatedConnectionConfigWebhookUrl({
            end_user: { id: '1' },
            integrations_config_defaults: {
                github: {
                    connection_config: {
                        subdomain: 'acme',
                        webhook_url: 'https://tunnel.example.com/hook'
                    }
                }
            }
        });

        expect(result).toEqual({
            ok: true,
            body: {
                end_user: { id: '1' },
                webhook_url_override: 'https://tunnel.example.com/hook',
                integrations_config_defaults: {
                    github: {
                        connection_config: {
                            subdomain: 'acme'
                        }
                    }
                }
            }
        });
    });

    it('lets an explicit webhook_url_override win over the deprecated nested field', () => {
        const result = mapDeprecatedConnectionConfigWebhookUrl({
            webhook_url_override: 'https://new.example.com/hook',
            integrations_config_defaults: {
                github: {
                    connection_config: {
                        webhook_url: 'https://old.example.com/hook'
                    }
                }
            }
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.body.webhook_url_override).toBe('https://new.example.com/hook');
        expect(result.body.integrations_config_defaults?.['github']?.connection_config).toBeUndefined();
    });

    it('lets an explicit empty webhook_url_override win (clear override)', () => {
        const result = mapDeprecatedConnectionConfigWebhookUrl({
            webhook_url_override: '',
            integrations_config_defaults: {
                github: {
                    connection_config: {
                        webhook_url: 'https://old.example.com/hook'
                    }
                }
            }
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.body.webhook_url_override).toBe('');
    });

    it('rejects an invalid deprecated nested webhook_url', () => {
        const result = mapDeprecatedConnectionConfigWebhookUrl({
            integrations_config_defaults: {
                github: {
                    connection_config: {
                        webhook_url: 'not-a-url'
                    }
                }
            }
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.issues[0]?.path).toEqual(['integrations_config_defaults', 'github', 'connection_config', 'webhook_url']);
        expect(result.issues[0]?.message).toContain('deprecated');
        expect(result.issues[0]?.message).toContain('webhook_url_override');
    });

    it('drops connection_config when webhook_url was the only key', () => {
        const result = mapDeprecatedConnectionConfigWebhookUrl({
            integrations_config_defaults: {
                github: {
                    connection_config: {
                        webhook_url: 'https://tunnel.example.com/hook'
                    }
                }
            }
        });

        expect(result).toEqual({
            ok: true,
            body: {
                webhook_url_override: 'https://tunnel.example.com/hook',
                integrations_config_defaults: {
                    github: {}
                }
            }
        });
    });
});
