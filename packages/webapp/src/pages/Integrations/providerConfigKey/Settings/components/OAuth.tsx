import { useState } from 'react';
import { mutate } from 'swr';

import { DeleteIntegrationButton } from './Delete';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { Button } from '../../../../../components/ui/button/Button';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { Input } from '../../../../../components/ui/input/Input';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import TagsInput from '../../../../../components/ui/input/TagsInput';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';
import { defaultCallback } from '../../../../../utils/utils';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsOAuth: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [loading, setLoading] = useState(false);
    const [clientId, setClientId] = useState(integration.oauth_client_id || '');
    const [clientSecret, setClientSecret] = useState(integration.oauth_client_secret || '');
    const [scopes, setScopes] = useState(integration.oauth_scopes || '');

    const handleScopeChange = (newScopes: string) => setScopes(newScopes);
    const handleSave = async () => {
        setLoading(true);

        const payload: any = {
            authType: template.auth_mode as any
        };

        if (!integration.shared_credentials_id) {
            payload.clientId = clientId;
            payload.clientSecret = clientSecret;
            payload.scopes = scopes;
        }

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

    const shouldShowCredentials = !integration.shared_credentials_id;
    const isSaveDisabled = shouldShowCredentials && (!clientId || !clientSecret);
    return (
        <div className="mt-10">
            <InfoBloc title="Callback URL">
                <div className="text-white text-sm">{environment.callback_url || defaultCallback()}</div>
                <CopyButton text={environment.callback_url || defaultCallback()} />
            </InfoBloc>

            <div className="flex flex-col gap-10 mt-10">
                <InfoBloc title="Client ID">
                    <div className="relative w-full">
                        <Input
                            className="w-full"
                            id="client_id"
                            name="client_id"
                            type="text"
                            value={shouldShowCredentials ? clientId : '••••••••••••••••••••••••••••••••'}
                            onChange={(e) => setClientId(e.target.value)}
                            autoComplete="one-time-code"
                            placeholder="Find the Client ID on the developer portal of the external API provider."
                            required
                            minLength={1}
                            variant={'flat'}
                            disabled={!shouldShowCredentials}
                            after={shouldShowCredentials ? <CopyButton text={clientId} /> : undefined}
                        />
                        {!shouldShowCredentials && (
                            <div className="absolute top-2 right-2 bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded-md font-medium z-10 pointer-events-none">
                                Nango provided
                            </div>
                        )}
                    </div>
                </InfoBloc>

                <InfoBloc title="Client Secret">
                    <div className="relative w-full">
                        <SecretInput
                            className="w-full"
                            copy={shouldShowCredentials}
                            view={shouldShowCredentials}
                            id="client_secret"
                            name="client_secret"
                            autoComplete="one-time-code"
                            placeholder="Find the Client Secret on the developer portal of the external API provider."
                            value={shouldShowCredentials ? clientSecret : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                            onChange={(e) => setClientSecret(e.target.value)}
                            required
                            disabled={!shouldShowCredentials}
                        />
                        {!shouldShowCredentials && (
                            <div className="absolute top-2 right-2 bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded-md font-medium z-10 pointer-events-none">
                                Nango provided
                            </div>
                        )}
                    </div>
                </InfoBloc>

                {template.auth_mode !== 'TBA' && template.installation !== 'outbound' && (
                    <InfoBloc title="Scopes">
                        <TagsInput
                            id="scopes"
                            name="scopes"
                            type="text"
                            selectedScopes={
                                scopes
                                    ? scopes
                                          .split(',')
                                          .map((s) => s.trim())
                                          .filter(Boolean)
                                    : []
                            }
                            onScopeChange={handleScopeChange}
                            minLength={1}
                            readOnly={!shouldShowCredentials}
                        />
                    </InfoBloc>
                )}

                <div className="flex justify-between">
                    {integration && <DeleteIntegrationButton env={env} integration={integration} />}
                    {shouldShowCredentials && (
                        <Button variant={'primary'} onClick={onSave} isLoading={loading} disabled={isSaveDisabled}>
                            Save
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
