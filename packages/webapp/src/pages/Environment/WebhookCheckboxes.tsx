import { useState } from 'react';
import { toast } from 'react-toastify';
import type { ChangeEvent } from 'react';
import { HelpCircle } from '@geist-ui/icons';
import { Tooltip } from '@geist-ui/core';
import type { WebhookSettings as CheckboxState } from '@nangohq/types';
import { apiFetch } from '../../utils/api';

interface CheckboxConfig {
    label: string;
    tooltip: string;
    stateKey: keyof CheckboxState;
}

const checkboxesConfig: CheckboxConfig[] = [
    {
        label: 'Send Webhooks For Empty Sync Responses',
        tooltip: 'If checked, a webhook will be sent on every sync run completion, even if no data has changed.',
        stateKey: 'alwaysSendWebhook'
    },
    {
        label: 'Send New Connection Creation Webhooks',
        tooltip: 'If checked, a webhook will be sent on connection creation success or failure.',
        stateKey: 'sendAuthWebhook'
    },
    {
        label: 'Send Auth Refresh Error Webhooks',
        tooltip: 'If checked, a webhook will be sent on connection refresh failure.',
        stateKey: 'sendRefreshFailedWebhook'
    },
    {
        label: 'Send Sync Error Webhooks',
        tooltip: 'If checked, a webhook will be sent on sync failure.',
        stateKey: 'sendSyncFailedWebhook'
    }
];

interface CheckboxFormProps {
    env: string;
    mutate: () => void;
    checkboxState: CheckboxState;
    setCheckboxState: React.Dispatch<React.SetStateAction<CheckboxState>>;
}

const CheckboxForm: React.FC<CheckboxFormProps> = ({ env, checkboxState, setCheckboxState, mutate }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleCheckboxChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = event.target;
        const updatedState = { ...checkboxState, [name]: checked };
        setCheckboxState(updatedState);

        const data: CheckboxState = Object.fromEntries(Object.entries(updatedState).map(([key, value]) => [key, Boolean(value)])) as unknown as CheckboxState;

        await handleSubmit(data);
    };

    const handleSubmit = async (data: CheckboxState) => {
        setIsLoading(true);
        const res = await apiFetch(`/api/v1/environment/webhook/settings?env=${env}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });

        if (res.status !== 200) {
            toast.error('There was an issue updating the webhook settings', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            toast.success('Webhook settings updated successfully!', { position: toast.POSITION.BOTTOM_CENTER });
            mutate();
        }
        setIsLoading(false);
    };

    return (
        <form onSubmit={(e) => e.preventDefault()}>
            {checkboxesConfig.map(({ label, tooltip, stateKey }) => (
                <div key={stateKey} className="mx-8 mt-8">
                    <div className="flex items-center mb-2">
                        <label htmlFor={stateKey} className={`${isLoading ? 'text-gray-700' : 'text-text-light-gray'} text-sm font-semibold`}>
                            {label}
                        </label>
                        <Tooltip
                            text={
                                <>
                                    <div className="flex text-black text-sm">{tooltip}</div>
                                </>
                            }
                        >
                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                        </Tooltip>
                        <input
                            type="checkbox"
                            name={stateKey}
                            disabled={isLoading}
                            className={`flex ml-3 bg-black ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            checked={checkboxState[stateKey]}
                            onChange={handleCheckboxChange}
                        />
                    </div>
                </div>
            ))}
        </form>
    );
};

export default CheckboxForm;
