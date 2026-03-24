import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import { EditableInput } from './components/EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { WebhookCheckboxes } from './components/WebhookCheckboxes';
import { useEnvironment, usePatchWebhook } from '../../../hooks/useEnvironment';
import { useStore } from '../../../store';
import { APIError } from '../../../utils/api';

export const Notifications: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { mutateAsync: patchWebhookAsync } = usePatchWebhook(env);

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
                        apiCall={async (value) => {
                            try {
                                const res = await patchWebhookAsync({ primary_url: value });
                                return { json: res };
                            } catch (err) {
                                if (err instanceof APIError) return { json: err.json };
                                throw err;
                            }
                        }}
                        onSuccess={() => {}}
                    />
                    <EditableInput
                        name="secondary_url"
                        title="Secondary URL"
                        placeholder="https://example.com/webhooks_from_nango"
                        subTitle={true}
                        originalValue={environmentAndAccount.webhook_settings.secondary_url || ''}
                        apiCall={async (value) => {
                            try {
                                const res = await patchWebhookAsync({ secondary_url: value });
                                return { json: res };
                            } catch (err) {
                                if (err instanceof APIError) return { json: err.json };
                                throw err;
                            }
                        }}
                        onSuccess={() => {}}
                    />
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
