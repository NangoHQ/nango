import { useState } from 'react';
import { mutate } from 'swr';

import { DeleteIntegrationButton } from './Delete.js';
import { InfoBloc } from '../../../../../components/InfoBloc.js';
import { Button } from '../../../../../components/ui/button/Button.js';
import { CopyButton } from '../../../../../components/ui/button/CopyButton.js';
import { Input } from '../../../../../components/ui/input/Input.js';
import TagsInput from '../../../../../components/ui/input/TagsInput.js';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration.js';
import { useToast } from '../../../../../hooks/useToast.js';
import { useStore } from '../../../../../store.js';
import { defaultCallback } from '../../../../../utils/utils.js';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsMcpOAuth: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [loading, setLoading] = useState(false);
    const [scopes, setScopes] = useState(integration.oauth_scopes || '');

    const handleScopeChange = (newScopes: string) => setScopes(newScopes);
    const handleSave = async () => {
        setLoading(true);

        const payload: Record<string, string> = {
            authType: template.auth_mode,
            scopes
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
                <InfoBloc title="Client ID">
                    <div className="relative w-full">
                        <Input
                            className="w-full"
                            id="client_id"
                            name="client_id"
                            type="text"
                            value={integration.oauth_client_id || ''}
                            autoComplete="one-time-code"
                            placeholder="Find the Client ID on the developer portal of the external API provider."
                            required
                            minLength={1}
                            variant={'flat'}
                            readOnly
                        />
                    </div>
                </InfoBloc>

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
                        clipboard={true}
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
