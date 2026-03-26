import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { usePatchWebhook } from '../../../../hooks/useEnvironment';
import { useToast } from '../../../../hooks/useToast';
import { Switch } from '@/components-v2/ui/switch';

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
    checkboxState: ApiWebhooks;
}

export const WebhookCheckboxes: React.FC<CheckboxFormProps> = ({ env, checkboxState }) => {
    const { toast } = useToast();
    const { mutateAsync: patchWebhookAsync } = usePatchWebhook(env);

    const [loading, setLoading] = useState<string | false>();

    const handleCheckboxChange = async (name: string, checked: boolean) => {
        if (loading) {
            return;
        }

        setLoading(name);
        try {
            await patchWebhookAsync({
                on_auth_creation: checkboxState['on_auth_creation'],
                on_auth_refresh_error: checkboxState['on_auth_refresh_error'],
                on_sync_completion_always: checkboxState['on_sync_completion_always'],
                on_sync_error: checkboxState['on_sync_error'],
                on_async_action_completion: checkboxState['on_async_action_completion'],
                [name]: checked
            });
        } catch {
            toast({ title: 'There was an issue updating the webhook settings', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-10">
            {checkboxesConfig.map(({ label, stateKey }) => (
                <div className="flex items-center justify-between" key={stateKey}>
                    <label htmlFor={stateKey} className={`text-sm font-medium`}>
                        {label}
                    </label>

                    <div className="flex gap-2 items-center">
                        {loading === stateKey && <Loader2 className="size-4 animate-spin" />}
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
