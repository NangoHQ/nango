import { useState } from 'react';
import { mutate } from 'swr';

import { DeleteIntegrationButton } from './Delete';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { Button } from '../../../../../components/ui/button/Button';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { Input } from '../../../../../components/ui/input/Input';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';

import type { ApiEnvironment, GetIntegration, ProviderInstallPlugin } from '@nangohq/types';

export const SettingsInstallPlugin: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template }
}) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const [loading, setLoading] = useState(false);
    const [appLink, setAppLink] = useState(integration.app_link || '');
    const [username, setUsername] = useState(integration.custom?.['username'] || '');
    const [password, setPassword] = useState(integration.custom?.['password'] || '');

    const onSave = async () => {
        setLoading(true);

        const payload: Record<string, string> = { authType: 'INSTALL_PLUGIN', appLink };

        if (template.auth_mode === 'INSTALL_PLUGIN') {
            const installPluginTemplate = template as ProviderInstallPlugin;
            if (installPluginTemplate.auth_type === 'BASIC') {
                payload.username = username;
                payload.password = password;
            }
        }

        // In the future, if we get API_KEY auth type, add api_key field here
        const updated = await apiPatchIntegration(env, integration.unique_key, payload);

        setLoading(false);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'Successfully updated integration', variant: 'success' });
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations`));
        }

        setLoading(false);
    };

    const isBasicAuth = template.auth_mode === 'INSTALL_PLUGIN' && (template as ProviderInstallPlugin).auth_type === 'BASIC';

    return (
        <div className="mt-10 flex flex-col gap-10">
            <InfoBloc title="Install Link">
                <Input
                    id="install_link"
                    name="install_link"
                    type="text"
                    value={appLink}
                    onChange={(e) => setAppLink(e.target.value)}
                    placeholder="Enter the install link for the plugin"
                    required
                    minLength={1}
                    variant={'flat'}
                    after={<CopyButton text={appLink} />}
                />
            </InfoBloc>

            {isBasicAuth && (
                <div className="grid grid-cols-2 gap-10">
                    <InfoBloc title="Username">
                        <SecretInput
                            copy={true}
                            id="username"
                            name="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                            required
                        />
                    </InfoBloc>
                    <InfoBloc title="Password">
                        <SecretInput
                            copy={true}
                            id="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            required
                        />
                    </InfoBloc>
                </div>
            )}

            <div className="flex justify-between">
                {integration && <DeleteIntegrationButton env={env} integration={integration} />}
                <Button variant={'primary'} onClick={onSave} isLoading={loading} disabled={isBasicAuth && (!username || !password)}>
                    Save
                </Button>
            </div>
        </div>
    );
};
