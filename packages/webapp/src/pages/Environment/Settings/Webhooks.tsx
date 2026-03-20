import { ExternalLink } from 'lucide-react';

import SettingsContent from './components/SettingsContent.js';
import SettingsGroup from './components/SettingsGroup.js';
import { WebhookCheckboxes } from './components/WebhookCheckboxes.js';
import { apiPatchWebhook, useEnvironment } from '../../../hooks/useEnvironment.js';
import { useStore } from '../../../store.js';
import { EditableInput } from '@/components-v2/EditableInput.js';
import { ButtonLink } from '@/components-v2/ui/button.js';
import { Label } from '@/components-v2/ui/label.js';

export const Notifications: React.FC = () => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

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
                            onSave={async (value) => {
                                await apiPatchWebhook(env, { primary_url: value });
                                void mutate();
                            }}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="primary_url">Secondary URL</Label>
                        <EditableInput
                            id="secondary_url"
                            placeholder="https://example.com/webhooks_from_nango"
                            initialValue={environmentAndAccount.webhook_settings.secondary_url || ''}
                            onSave={async (value) => {
                                await apiPatchWebhook(env, { secondary_url: value });
                                void mutate();
                            }}
                        />
                    </div>
                </div>
            </SettingsGroup>
            <SettingsGroup label="Subscriptions">
                <div className="flex flex-col gap-7">
                    <div>
                        <WebhookCheckboxes env={env} checkboxState={environmentAndAccount.webhook_settings} mutate={mutate} />
                    </div>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
