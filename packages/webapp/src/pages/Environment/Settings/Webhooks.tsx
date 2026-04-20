import { ExternalLink } from 'lucide-react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent.js';
import SettingsGroup from './components/SettingsGroup.js';
import { WebhookCheckboxes } from './components/WebhookCheckboxes.js';
import { useEnvironment, usePatchWebhook } from '../../../hooks/useEnvironment.js';
import { useStore } from '../../../store.js';
import { EditableInput } from '@/components-v2/EditableInput.js';
import { ButtonLink } from '@/components-v2/ui/button.js';
import { Label } from '@/components-v2/ui/label.js';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useToast } from '@/hooks/useToast.js';
import { validateUrl } from '@/pages/Integrations/utils.js';

import type { PatchWebhook } from '@nangohq/types';

export const Webhooks: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchWebhookAsync } = usePatchWebhook(env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const environment = environmentAndAccount?.environment;

    const { can } = usePermissions();
    const canWriteWebhooks = can(permissions.canWriteProdWebhooks) || !environment?.is_production;

    const onSave = async (body: PatchWebhook['Body']) => {
        try {
            await patchWebhookAsync(body);
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch (err) {
            toast({ title: 'Failed to update, an error occurred', variant: 'error' });
            throw err;
        }
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Webhooks">
            <SettingsGroup
                label={
                    <div className="flex gap-1.5">
                        Webhook URLs
                        <ButtonLink target="_blank" to="https://nango.dev/docs/implementation-guides/platform/webhooks-from-nango" variant="ghost" size="icon">
                            <ExternalLink />
                        </ButtonLink>
                    </div>
                }
            >
                <div className="flex flex-col gap-7">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="primary_url">Primary URL</Label>
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
                        <Label htmlFor="secondary_url">Secondary URL</Label>
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
