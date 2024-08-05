import type { GetIntegration } from '@nangohq/types';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { Input } from '../../../../../components/ui/input/Input';
import { InfoBloc } from '../../../../../components/InfoBloc';
import SecretTextarea from '../../../../../components/ui/input/SecretTextArea';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { DeleteIntegrationButton } from './Delete';
import Button from '../../../../../components/ui/button/Button';
import { useState } from 'react';
import { useStore } from '../../../../../store';

export const SettingsApp: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data: { integration },
    environment
}) => {
    const env = useStore((state) => state.env);
    const [loading, setLoading] = useState(false);

    const onSave = () => {
        setLoading(true);
        setLoading(false);
    };

    return (
        <div className="mt-10 flex flex-col gap-10">
            {environment.callback_url && (
                <InfoBloc
                    title="Setup URL"
                    help='Register this setup URL on the app settings page in the "Post Installation section". Check "Redirect on update" as well.'
                >
                    <div>{environment.callback_url.replace('oauth/callback', 'app-auth/connect')}</div>
                    <CopyButton text={environment.callback_url.replace('oauth/callback', 'app-auth/connect')} />
                </InfoBloc>
            )}
            <div className="flex gap-10">
                <InfoBloc title="App ID">
                    <Input
                        id="app_id"
                        name="app_id"
                        type="text"
                        defaultValue={integration.oauth_client_id}
                        placeholder="Obtain the app id from the app page."
                        required
                        minLength={1}
                        variant={'flat'}
                        after={<CopyButton text={integration.oauth_client_id} />}
                    />
                </InfoBloc>
                <InfoBloc title="App Public Link">
                    <Input
                        id="app_link"
                        name="app_link"
                        type="text"
                        defaultValue={integration.app_link}
                        placeholder="Obtain the app public link from the app page."
                        required
                        minLength={1}
                        variant={'flat'}
                        after={<CopyButton text={integration.app_link || ''} />}
                    />
                </InfoBloc>
            </div>

            <InfoBloc
                title="App Private Key"
                help={<p>Obtain the app private key from the app page by downloading the private key and pasting the entirety of its contents here</p>}
            >
                <SecretTextarea
                    copy={true}
                    id="private_key"
                    name="private_key"
                    defaultValue={integration.oauth_client_secret}
                    additionalClass={`w-full`}
                    required
                />
            </InfoBloc>

            <div className="flex justify-between">
                {integration && <DeleteIntegrationButton env={env} integration={integration} />}
                <Button variant={'primary'} onClick={onSave} isLoading={loading}>
                    Save
                </Button>
            </div>
        </div>
    );
};
