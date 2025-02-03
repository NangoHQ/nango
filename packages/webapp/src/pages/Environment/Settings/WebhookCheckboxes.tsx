import { useState } from 'react';
import type { ApiWebhooks } from '@nangohq/types';
import { useToast } from '../../../hooks/useToast';
import { apiPatchWebhook } from '../../../hooks/useEnvironment';
import { Switch } from '../../../components/ui/Switch';

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
    }
];

interface CheckboxFormProps {
    env: string;
    mutate: () => void;
    checkboxState: ApiWebhooks;
}

export const WebhookCheckboxes: React.FC<CheckboxFormProps> = ({ env, checkboxState, mutate }) => {
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(false);

    const handleCheckboxChange = async (name: string, checked: boolean) => {
        if (isLoading) {
            return;
        }

        setIsLoading(true);
        const res = await apiPatchWebhook(env, {
            on_auth_creation: checkboxState['on_auth_creation'],
            on_auth_refresh_error: checkboxState['on_auth_refresh_error'],
            on_sync_completion_always: checkboxState['on_sync_completion_always'],
            on_sync_error: checkboxState['on_sync_error'],
            [name]: checked
        });

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the webhook settings', variant: 'error' });
            setIsLoading(false);
            return;
        }

        toast({ title: 'Webhook settings updated successfully!', variant: 'success' });
        mutate();

        setIsLoading(false);
    };

    return (
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-5 mt-1">
            {checkboxesConfig.map(({ label, stateKey }) => (
                <div className="flex items-center justify-between" key={stateKey}>
                    <label htmlFor={stateKey} className={`text-sm font-medium`}>
                        {label}
                    </label>

                    <Switch
                        name="hmac_enabled"
                        checked={checkboxState[stateKey] as boolean}
                        onCheckedChange={(checked) => handleCheckboxChange(stateKey, Boolean(checked))}
                    />
                </div>
            ))}
        </form>
    );
};
