import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import { EditableInput } from './EditableInput';
import { WebhookCheckboxes } from './WebhookCheckboxes';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { apiPatchWebhook, useEnvironment } from '../../../hooks/useEnvironment';
import { useStore } from '../../../store';

export const NotificationSettings: React.FC = () => {
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
                        <Link
                            className="flex gap-2 items-center"
                            target="_blank"
                            to="https://nango.dev/docs/implementation-guides/platform/webhooks-from-nango"
                        >
                            <IconExternalLink stroke={1} size={18} />
                        </Link>
                    </div>
                }
            >
                <div className="flex flex-col gap-7">
                    <EditableInput
                        name="primary_url"
                        title="Primary URL"
                        placeholder="https://example.com/webhooks_from_nango"
                        subTitle={true}
                        originalValue={environmentAndAccount.webhook_settings.primary_url || ''}
                        apiCall={(value) => apiPatchWebhook(env, { primary_url: value })}
                        onSuccess={() => void mutate()}
                    />
                    <EditableInput
                        name="secondary_url"
                        title="Secondary URL"
                        placeholder="https://example.com/webhooks_from_nango"
                        subTitle={true}
                        originalValue={environmentAndAccount.webhook_settings.secondary_url || ''}
                        apiCall={(value) => apiPatchWebhook(env, { secondary_url: value })}
                        onSuccess={() => void mutate()}
                    />
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
