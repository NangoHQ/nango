import { useState } from 'react';
import { mutate } from 'swr';

import { DeleteIntegrationButton } from './Delete';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { Button } from '../../../../../components/ui/button/Button';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { Input } from '../../../../../components/ui/input/Input';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';
import { defaultCallback } from '../../../../../utils/utils';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsMcpGeneric: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [loading, setLoading] = useState(false);
    const [clientName, setClientName] = useState(integration.custom?.oauth_client_name || '');
    const [clientUri, setClientUri] = useState(integration.custom?.oauth_client_uri || '');
    const [clientLogoUri, setClientLogoUri] = useState(integration.custom?.oauth_client_logo_uri || '');

    const handleSave = async () => {
        setLoading(true);

        const payload: Record<string, string> = {
            authType: template.auth_mode,
            ...(clientName && { clientName }),
            ...(clientUri && { clientUri }),
            ...(clientLogoUri && { clientLogoUri })
        };

        const updated = await apiPatchIntegration(env, integration.unique_key, payload);

        setLoading(false);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations`));
            toast({ title: 'Successfully updated integration', variant: 'success' });
        }
    };

    const onSave = async () => {
        await handleSave();
    };

    return (
        <div className="mt-10">
            <InfoBloc title="Callback URL">
                <div className="text-white text-sm">{environment.callback_url || defaultCallback()}</div>
                <CopyButton text={environment.callback_url || defaultCallback()} />
            </InfoBloc>

            <div className="flex flex-col gap-10 mt-10">
                <InfoBloc title="OAuth Client Name">
                    <div className="relative w-full">
                        <Input
                            className="w-full"
                            id="client_name"
                            name="client_name"
                            type="text"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="e.g., My Application"
                            maxLength={255}
                            variant={'flat'}
                            autoComplete="off"
                        />
                    </div>
                </InfoBloc>

                <InfoBloc title="OAuth Client URI">
                    <div className="relative w-full">
                        <Input
                            className="w-full"
                            id="client_uri"
                            name="client_uri"
                            type="url"
                            value={clientUri}
                            onChange={(e) => setClientUri(e.target.value)}
                            placeholder="https://example.com"
                            maxLength={255}
                            variant={'flat'}
                            autoComplete="url"
                        />
                    </div>
                </InfoBloc>

                <InfoBloc title="OAuth Client Logo URI">
                    <div className="relative w-full">
                        <Input
                            className="w-full"
                            id="client_logo_uri"
                            name="client_logo_uri"
                            type="url"
                            value={clientLogoUri}
                            onChange={(e) => setClientLogoUri(e.target.value)}
                            placeholder="https://example.com/logo.png"
                            maxLength={255}
                            variant={'flat'}
                            autoComplete="url"
                        />
                    </div>
                </InfoBloc>

                <div className="flex justify-between">
                    {integration && <DeleteIntegrationButton env={env} integration={integration} />}
                    <Button variant={'primary'} onClick={onSave} isLoading={loading}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
};
