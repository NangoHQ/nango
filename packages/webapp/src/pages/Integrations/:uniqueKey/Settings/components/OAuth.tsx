import type { GetIntegration } from '@nangohq/types';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { defaultCallback } from '../../../../../utils/utils';
import type { EnvironmentAndAccount } from '@nangohq/server';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import Button from '../../../../../components/ui/button/Button';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { Input } from '../../../../../components/ui/input/Input';
import { useState } from 'react';
import { DeleteIntegrationButton } from './Delete';
import { useStore } from '../../../../../store';

export const SettingsOAuth: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
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
        <div className="mt-10">
            <InfoBloc title="Callback URL">
                <div className="text-white text-sm">{environment.callback_url || defaultCallback()}</div>
                <CopyButton text={environment.callback_url || defaultCallback()} />
            </InfoBloc>

            <div className="flex flex-col gap-10 mt-10">
                <InfoBloc title="Client ID">
                    <Input
                        id="client_id"
                        name="client_id"
                        type="text"
                        defaultValue={integration ? integration.oauth_client_id : ''}
                        autoComplete="one-time-code"
                        placeholder="Find the Client ID on the developer portal of the external API provider."
                        required
                        minLength={1}
                        variant={'flat'}
                        after={<CopyButton text={integration.oauth_client_id} />}
                    />
                </InfoBloc>
                <InfoBloc title="Client Secret">
                    <SecretInput
                        copy={true}
                        id="client_secret"
                        name="client_secret"
                        autoComplete="one-time-code"
                        placeholder="Find the Client Secret on the developer portal of the external API provider."
                        defaultValue={integration ? integration.oauth_client_secret : ''}
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
        </div>
    );
};
