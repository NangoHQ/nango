import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle, Button, FieldLabel } from '@nangohq/design-system';

import { DocsIconLink } from '@/components/patterns/DocsIconLink.js';
import { EditableInput } from '@/components/patterns/EditableInput.js';
import { PermissionGate } from '@/components/patterns/PermissionGate.js';
import { SecretInput } from '@/components/patterns/SecretInput.js';
import { useConfirmDialog } from '@/hooks/useConfirmDialog.js';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useToast } from '@/hooks/useToast.js';
import { validateUrl } from '@/pages/Integrations/utils.js';
import { useStore } from '@/store';
import { useEnvironment, usePatchWebhook, usePostRotateWebhookSigningKey } from '../../../hooks/useEnvironment.js';
import SettingsContent from './components/SettingsContent.js';
import SettingsGroup from './components/SettingsGroup.js';
import { WebhookCheckboxes } from './components/WebhookCheckboxes.js';

import type { PatchWebhook } from '@nangohq/types';

const SIGNING_KEY_PROPAGATION_MS = 5 * 60 * 1000;

export const Webhooks: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchWebhookAsync } = usePatchWebhook(env);
    const { mutateAsync: rotateSigningKeyAsync } = usePostRotateWebhookSigningKey(env);
    const { confirm, DialogComponent } = useConfirmDialog();
    const [bothKeysValidUntil, setBothKeysValidUntil] = useState<Date | null>(null);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;

    const { can } = usePermissions();
    const canWriteWebhooks = can('environment:webhooks:update');
    const canReadSigningKey = can('environment:settings:read_secret');
    const canRotateSigningKey = can('environment:webhook_signing_key:rotate');

    useEffect(() => {
        if (!bothKeysValidUntil) {
            return;
        }
        const timeout = setTimeout(() => setBothKeysValidUntil(null), bothKeysValidUntil.getTime() - Date.now());
        return () => clearTimeout(timeout);
    }, [bothKeysValidUntil]);

    const onSave = async (body: PatchWebhook['Body']) => {
        try {
            await patchWebhookAsync(body);
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch (err) {
            toast({ title: 'Failed to update, an error occurred', variant: 'error' });
            throw err;
        }
    };

    const onRotateSigningKey = () =>
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

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Webhooks">
            {DialogComponent}
            <SettingsGroup
                label={
                    <div className="flex gap-1.5">
                        Webhook URLs
                        <DocsIconLink href="https://nango.dev/docs/guides/platform/webhooks-from-nango" label="Webhooks documentation" />
                    </div>
                }
            >
                <div className="flex flex-col gap-7">
                    <div className="flex flex-col gap-2">
                        <FieldLabel htmlFor="primary_url">Primary URL</FieldLabel>
                        <EditableInput
                            id="primary_url"
                            placeholder="https://example.com/webhooks_from_nango"
                            initialValue={environmentAndAccount.webhook_settings.primary_url || ''}
                            onSave={(value) => onSave({ primary_url: value })}
                            validate={(value) => validateUrl(value, true)}
                            canEdit={canWriteWebhooks}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <FieldLabel htmlFor="secondary_url">Secondary URL</FieldLabel>
                        <EditableInput
                            id="secondary_url"
                            placeholder="https://example.com/webhooks_from_nango"
                            initialValue={environmentAndAccount.webhook_settings.secondary_url || ''}
                            onSave={(value) => onSave({ secondary_url: value })}
                            validate={(value) => validateUrl(value, true)}
                            canEdit={canWriteWebhooks}
                        />
                    </div>
                </div>
            </SettingsGroup>
            <SettingsGroup label="Signing key">
                <div className="flex flex-col gap-2">
                    <p className="text-body-small-regular text-text-secondary">
                        Use this key to verify that webhook payloads are from Nango.{' '}
                        <a
                            href="https://nango.dev/docs/guides/platform/webhooks-from-nango#verifying-webhooks-from-nango"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-brand hover:underline"
                        >
                            Learn more
                        </a>
                    </p>
                    <SecretInput value={environmentAndAccount.webhook_signing_key ?? ''} copy={canReadSigningKey} canRead={canReadSigningKey} readOnly />
                    {bothKeysValidUntil && (
                        <Alert variant="warning" size="compact">
                            <TriangleAlert />
                            <AlertTitle>Accept both keys until {bothKeysValidUntil.toLocaleTimeString()}</AlertTitle>
                            <AlertDescription>
                                The new key takes up to 5 minutes to reach every Nango process. Until then, webhooks can be signed with either the old or the
                                new key. Switching verification over right away will reject valid webhooks.
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="self-start">
                        <PermissionGate condition={canRotateSigningKey}>
                            {(allowed) => (
                                <Button variant="outline" size="sm" disabled={!allowed} onClick={() => void onRotateSigningKey()}>
                                    <RefreshCw />
                                    Rotate key
                                </Button>
                            )}
                        </PermissionGate>
                    </div>
                </div>
            </SettingsGroup>
            <SettingsGroup label="Subscriptions">
                <div className="flex flex-col gap-7">
                    <div>
                        <WebhookCheckboxes env={env} checkboxState={environmentAndAccount.webhook_settings} />
                    </div>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
