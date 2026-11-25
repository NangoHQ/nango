import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle, Badge, Button, Field, FieldError, Input, SecretInput } from '@nangohq/design-system';

import { DocsIconLink } from '@/components/patterns/DocsIconLink.js';
import { PERMISSION_DENIED_REASON, PermissionGate } from '@/components/patterns/PermissionGate.js';
import { InfoTooltip } from '@/components/ui/InfoTooltip.js';
import { Switch } from '@/components/ui/Switch.js';
import { useConfirmDialog } from '@/hooks/useConfirmDialog.js';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useToast } from '@/hooks/useToast.js';
import { validateUrl } from '@/pages/Integrations/utils.js';
import { useStore } from '@/store';
import { useEnvironment, usePatchWebhook, usePostRotateWebhookSigningKey } from '../../../hooks/useEnvironment.js';
import { SettingsCard, SettingsRow } from './components/SettingsCard.js';
import { apiErrorMessage } from './utils.js';

import type { ApiWebhooks } from '@nangohq/types';

const SIGNING_KEY_PROPAGATION_MS = 5 * 60 * 1000;

type EventKey =
    | 'on_auth_creation'
    | 'on_auth_refresh_error'
    | 'on_connection_deletion'
    | 'on_async_action_completion'
    | 'on_sync_error'
    | 'on_sync_completion_always';

interface WebhookEvent {
    key: EventKey;
    label: string;
    description: string;
    deprecated?: boolean;
}

const EVENT_GROUPS: { label: string; events: WebhookEvent[] }[] = [
    {
        label: 'Auth',
        events: [
            { key: 'on_auth_creation', label: 'Connection created', description: 'When a user finishes authorizing, whether it succeeds or fails.' },
            {
                key: 'on_auth_refresh_error',
                label: 'Token refresh failed',
                description: 'When Nango can’t refresh a connection’s credentials, and again once it recovers.'
            },
            { key: 'on_connection_deletion', label: 'Connection deleted', description: 'When a connection is deleted.' }
        ]
    },
    {
        label: 'Actions',
        events: [
            {
                key: 'on_async_action_completion',
                label: 'Async action completed',
                description: 'When an async action finishes running.',
                deprecated: true
            }
        ]
    },
    {
        label: 'Syncs',
        events: [
            { key: 'on_sync_error', label: 'Sync failed', description: 'When a sync run ends with an error.' },
            { key: 'on_sync_completion_always', label: 'Sync with no changes', description: 'Sent after every sync run, even when no records changed.' }
        ]
    }
];

const EndpointsCard: React.FC<{ env: string; settings: ApiWebhooks; canEdit: boolean }> = ({ env, settings, canEdit }) => {
    const { toast } = useToast();
    const { mutateAsync: patchWebhookAsync, isPending } = usePatchWebhook(env);
    const savedPrimary = settings.primary_url || '';
    const savedSecondary = settings.secondary_url || '';
    const [primary, setPrimary] = useState(savedPrimary);
    const [secondary, setSecondary] = useState(savedSecondary);

    const primaryError = validateUrl(primary, true);
    const secondaryError = validateUrl(secondary, true);
    const dirty = primary !== savedPrimary || secondary !== savedSecondary;

    const onSave = async () => {
        try {
            await patchWebhookAsync({ primary_url: primary, secondary_url: secondary });
            toast({ title: 'Webhook URLs updated', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to update webhook URLs'), variant: 'error' });
        }
    };

    return (
        <SettingsCard
            title={
                <span className="inline-flex items-center gap-1.5">
                    Endpoints
                    <DocsIconLink href="https://nango.dev/docs/guides/platform/webhooks-from-nango" label="Webhooks documentation" />
                </span>
            }
            dirty={dirty}
            invalid={!!primaryError || !!secondaryError}
            saving={isPending}
            canEdit={canEdit}
            onSave={onSave}
            onDiscard={() => {
                setPrimary(savedPrimary);
                setSecondary(savedSecondary);
            }}
        >
            <SettingsRow label="Primary URL" htmlFor="primary_url">
                <Field data-invalid={!!primaryError}>
                    <Input
                        id="primary_url"
                        mono
                        value={primary}
                        placeholder="https://api.example.com/webhooks/nango"
                        onChange={(e) => setPrimary(e.target.value)}
                        disabled={!canEdit}
                        aria-invalid={!!primaryError}
                    />
                    {primaryError && <FieldError>{primaryError}</FieldError>}
                </Field>
            </SettingsRow>
            <SettingsRow label="Secondary URL" description="Optional" htmlFor="secondary_url">
                <Field data-invalid={!!secondaryError}>
                    <Input
                        id="secondary_url"
                        mono
                        value={secondary}
                        placeholder="https://staging.example.com/webhooks/nango"
                        onChange={(e) => setSecondary(e.target.value)}
                        disabled={!canEdit}
                        aria-invalid={!!secondaryError}
                    />
                    {secondaryError && <FieldError>{secondaryError}</FieldError>}
                </Field>
            </SettingsRow>
        </SettingsCard>
    );
};

const SigningKeyCard: React.FC<{ env: string; signingKey: string; canReveal: boolean; canRotate: boolean }> = ({ env, signingKey, canReveal, canRotate }) => {
    const { toast } = useToast();
    const { mutateAsync: rotateSigningKeyAsync } = usePostRotateWebhookSigningKey(env);
    const { confirm, DialogComponent } = useConfirmDialog();
    const [bothKeysValidUntil, setBothKeysValidUntil] = useState<Date | null>(null);

    useEffect(() => {
        if (!bothKeysValidUntil) {
            return;
        }
        const timeout = setTimeout(() => setBothKeysValidUntil(null), bothKeysValidUntil.getTime() - Date.now());
        return () => clearTimeout(timeout);
    }, [bothKeysValidUntil]);

    const onRotate = () =>
        confirm({
            title: 'Rotate signing key?',
            description:
                'A new key replaces the current one. For up to 5 minutes, webhooks are signed with either the old or the new key, so keep accepting both until then.',
            confirmButtonText: 'Rotate key',
            confirmVariant: 'danger',
            icon: <RefreshCw />,
            onConfirm: async () => {
                try {
                    await rotateSigningKeyAsync();
                    setBothKeysValidUntil(new Date(Date.now() + SIGNING_KEY_PROPAGATION_MS));
                    toast({ title: 'Signing key rotated', variant: 'success' });
                } catch {
                    toast({ title: 'Failed to rotate signing key', variant: 'error' });
                }
            }
        });

    return (
        <SettingsCard
            title={
                <span className="inline-flex items-center gap-1.5">
                    Signing key
                    <DocsIconLink
                        href="https://nango.dev/docs/guides/platform/webhooks-from-nango#verifying-webhooks-from-nango"
                        label="Verifying webhooks documentation"
                    />
                </span>
            }
            action={
                canRotate && (
                    <Button variant="ghost" size="sm" onClick={() => void onRotate()}>
                        <RefreshCw />
                        Rotate key
                    </Button>
                )
            }
        >
            {DialogComponent}
            <p className="type-text-regular-sm text-text-secondary">Verify that webhook payloads come from Nango.</p>
            <SecretInput value={signingKey} canReveal={canReveal} disabledReason={PERMISSION_DENIED_REASON} aria-label="Signing key" />
            {bothKeysValidUntil && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>Accept both keys until {bothKeysValidUntil.toLocaleTimeString()}</AlertTitle>
                    <AlertDescription>
                        The new key takes up to 5 minutes to reach every Nango process. Until then, webhooks can be signed with either the old or the new key.
                        Switching verification over right away will reject valid webhooks.
                    </AlertDescription>
                </Alert>
            )}
        </SettingsCard>
    );
};

const EventsCard: React.FC<{ env: string; settings: ApiWebhooks; canEdit: boolean }> = ({ env, settings, canEdit }) => {
    const { toast } = useToast();
    const { mutateAsync: patchWebhookAsync } = usePatchWebhook(env);
    const [pending, setPending] = useState<ReadonlySet<EventKey>>(new Set());

    const onToggle = async (key: EventKey, checked: boolean) => {
        setPending((prev) => new Set(prev).add(key));
        try {
            await patchWebhookAsync({ [key]: checked });
            toast({ title: `${checked ? 'Subscribed to' : 'Unsubscribed from'} event`, variant: 'success' });
        } catch {
            toast({ title: 'Failed to update webhook events', variant: 'error' });
        } finally {
            setPending((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    return (
        <SettingsCard title="Events">
            {EVENT_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-1.5">
                    <h3 className="type-label-sm uppercase text-text-muted">{group.label}</h3>
                    <div>
                        {group.events.map((event) => (
                            <div key={event.key} className="flex items-center gap-4 border-b border-border-muted py-2.5 last:border-b-0">
                                <div className="flex flex-1 items-center gap-1.5">
                                    <label htmlFor={`event-${event.key}`} className="type-text-medium-sm text-text-default">
                                        {event.label}
                                    </label>
                                    {event.deprecated && <Badge variant="warning">Deprecated</Badge>}
                                    <InfoTooltip size="sm">
                                        {event.deprecated ? `Deprecated: ${event.description} It will be removed in a future release.` : event.description}
                                    </InfoTooltip>
                                </div>
                                <PermissionGate condition={canEdit}>
                                    {(allowed) => (
                                        <Switch
                                            id={`event-${event.key}`}
                                            checked={settings[event.key]}
                                            onCheckedChange={(checked) => void onToggle(event.key, checked)}
                                            disabled={!allowed || pending.has(event.key)}
                                        />
                                    )}
                                </PermissionGate>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </SettingsCard>
    );
};

export const Webhooks: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;

    const { can } = usePermissions();
    const canWriteWebhooks = can('environment:webhooks:update');
    const canReadSigningKey = can('environment:settings:read_secret');
    const canRotateSigningKey = can('environment:webhook_signing_key:rotate');

    if (!environmentAndAccount) {
        return null;
    }

    const settings = environmentAndAccount.webhook_settings;

    return (
        <div className="flex flex-col gap-5">
            {!settings.primary_url && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>No endpoint set</AlertTitle>
                    <AlertDescription>
                        {canWriteWebhooks ? 'Add a primary URL to start receiving events.' : 'No events are sent until an admin adds a primary URL.'}
                    </AlertDescription>
                </Alert>
            )}
            <EndpointsCard env={env} settings={settings} canEdit={canWriteWebhooks} />
            <SigningKeyCard
                env={env}
                signingKey={environmentAndAccount.webhook_signing_key ?? ''}
                canReveal={canReadSigningKey}
                canRotate={canRotateSigningKey}
            />
            <EventsCard env={env} settings={settings} canEdit={canWriteWebhooks} />
        </div>
    );
};
