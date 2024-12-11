import type { GetIntegration } from '@nangohq/types';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { defaultCallback } from '../../../../../utils/utils';
import type { EnvironmentAndAccount } from '@nangohq/server';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import { Button } from '../../../../../components/ui/button/Button';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { Input } from '../../../../../components/ui/input/Input';
import { useState } from 'react';
import { DeleteIntegrationButton } from './Delete';
import { useStore } from '../../../../../store';
import SecretTextarea from '../../../../../components/ui/input/SecretTextArea';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { mutate } from 'swr';

export const SettingsCustom: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data: { integration },
    environment
}) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const [loading, setLoading] = useState(false);
    const [appId, setAppId] = useState(integration.custom?.app_id || '');
    const [appLink, setAppLink] = useState(integration.app_link || '');
    const [privateKey, setPrivateKey] = useState(integration.custom?.private_key || '');
    const [clientId, setClientId] = useState(integration.oauth_client_id || '');
    const [clientSecret, setClientSecret] = useState(integration.oauth_client_secret || '');

    const onSave = async () => {
        setLoading(true);

        const updated = await apiPatchIntegration(env, integration.unique_key, { authType: 'CUSTOM', clientId, clientSecret, appId, appLink, privateKey });

        setLoading(false);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'Successfully updated integration', variant: 'success' });
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations`));
        }

        setLoading(false);
    };

    return (
        <div className="mt-10">
            <InfoBloc title="Callback URL">
                <div className="text-white text-sm">{environment.callback_url || defaultCallback()}</div>
                <CopyButton text={environment.callback_url || defaultCallback()} />
            </InfoBloc>

            <div className="flex flex-col gap-10 mt-10">
                <div className="grid grid-cols-2 gap-10">
                    <InfoBloc title="App ID">
                        <Input
                            id="app_id"
                            name="app_id"
                            type="text"
                            value={appId}
                            onChange={(e) => setAppId(e.target.value)}
                            placeholder="Obtain the app id from the app page."
                            required
                            minLength={1}
                            variant={'flat'}
                            after={<CopyButton text={integration.oauth_client_id || ''} />}
                        />
                    </InfoBloc>
                    <InfoBloc title="App Public Link">
                        <Input
                            id="app_link"
                            name="app_link"
                            type="text"
                            value={appLink}
                            onChange={(e) => setAppLink(e.target.value)}
                            placeholder="Obtain the app public link from the app page."
                            required
                            minLength={1}
                            variant={'flat'}
                            after={<CopyButton text={integration.app_link || ''} />}
                        />
                    </InfoBloc>
                </div>

                <InfoBloc title="Client ID">
                    <Input
                        id="client_id"
                        name="client_id"
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        autoComplete="one-time-code"
                        placeholder="Find the Client ID on the developer portal of the external API provider."
                        required
                        minLength={1}
                        variant={'flat'}
                        after={<CopyButton text={integration.oauth_client_id || ''} />}
                    />
                </InfoBloc>

                <InfoBloc title="Client Secret">
                    <SecretInput
                        copy={true}
                        id="client_secret"
                        name="client_secret"
                        autoComplete="one-time-code"
                        placeholder="Find the Client Secret on the developer portal of the external API provider."
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        required
                    />
                </InfoBloc>

                <InfoBloc
                    title="App Private Key"
                    help={<p>Obtain the app private key from the app page by downloading the private key and pasting the entirety of its contents here</p>}
                >
                    <SecretTextarea
                        copy={true}
                        id="private_key"
                        name="private_key"
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        additionalClass={`w-full`}
                        required
                    />
                </InfoBloc>

                <div className="flex justify-between">
                    {integration && <DeleteIntegrationButton env={env} integration={integration} />}
                    <Button variant={'primary'} onClick={onSave} isLoading={loading} disabled={!appId || !appLink || !privateKey || !clientId || !clientSecret}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
};
