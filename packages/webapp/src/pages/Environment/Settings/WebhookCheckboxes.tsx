import { useState } from 'react';

import Spinner from '../../../components/ui/Spinner';
import { Switch } from '../../../components/ui/Switch';
import { apiPatchWebhook } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';

import type { ApiWebhooks } from '@nangohq/types';

interface CheckboxConfig {
    label: string;
    tooltip: string;
    stateKey: keyof ApiWebhooks;
}

const checkboxesConfig: CheckboxConfig[] = [
    {
        label: 'Auth: new connection webhooks',
        tooltip: 'If checked, a webhook will be sent on connection creation success or failure.',
        stateKey: 'on_auth_creation'
    },
    {
        label: 'Auth: token refresh error webhooks',
        tooltip: 'If checked, a webhook will be sent on connection refresh failure.',
        stateKey: 'on_auth_refresh_error'
    },
    {
        label: 'Syncs: error webhooks',
        tooltip: 'If checked, a webhook will be sent on sync failure.',
        stateKey: 'on_sync_error'
    },
    {
        label: 'Syncs: no update webhooks',
        tooltip: 'If checked, a webhook will be sent on every sync run completion, even if no data has changed.',
        stateKey: 'on_sync_completion_always'
    },
    {
        label: 'Async Actions: completion',
        tooltip: 'If checked, a webhook will be sent when an async action completes.',
        stateKey: 'on_async_action_completion'
    }
];

interface CheckboxFormProps {
    env: string;
    mutate: () => void;
    checkboxState: ApiWebhooks;
}

export const WebhookCheckboxes: React.FC<CheckboxFormProps> = ({ env, checkboxState, mutate }) => {
    const { toast } = useToast();

    const [loading, setLoading] = useState<string | false>();

    const handleCheckboxChange = async (name: string, checked: boolean) => {
        if (loading) {
            return;
        }

        setLoading(name);
        const res = await apiPatchWebhook(env, {
            on_auth_creation: checkboxState['on_auth_creation'],
            on_auth_refresh_error: checkboxState['on_auth_refresh_error'],
            on_sync_completion_always: checkboxState['on_sync_completion_always'],
            on_sync_error: checkboxState['on_sync_error'],
            on_async_action_completion: checkboxState['on_async_action_completion'],
            [name]: checked
        });
        setLoading(false);

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the webhook settings', variant: 'error' });
            return;
        }

        mutate();

        toast({ title: 'Webhook settings updated successfully!', variant: 'success' });
    };

    return (
        <div className="flex flex-col gap-5 mt-1">
            {checkboxesConfig.map(({ label, stateKey }) => (
                <div className="flex items-center justify-between" key={stateKey}>
                    <label htmlFor={stateKey} className={`text-sm font-medium`}>
                        {label}
                    </label>

                    <div className="flex gap-2 items-center">
                        {loading === stateKey && <Spinner size={1} />}
                        <Switch
                            name="hmac_enabled"
                            checked={checkboxState[stateKey] as boolean}
                            onCheckedChange={(checked) => handleCheckboxChange(stateKey, Boolean(checked))}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};
