import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { ScopesInput } from '@/components/patterns/ScopesInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { defaultCallback } from '@/utils/cloud';
import { SettingsField } from './SettingsLayout';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const McpOAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const callbackUrl = environment.callback_url || defaultCallback();
    const useUserCredentials = 'client_registration' in template && template.client_registration === 'static';

    const onSaveCredentials = async (field: { clientId?: string; clientSecret?: string }) => {
        try {
            await patchIntegration({
                authType: template.auth_mode as Extract<typeof template.auth_mode, 'MCP_OAUTH2'>,
                ...field
            });
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch {
            const message = 'Failed to update, an error occurred';
            toast({ title: message, variant: 'error' });
            throw new Error(message);
        }
    };

    const handleScopesChange = async (scopes: string, countDifference: number) => {
        try {
            await patchIntegration({
                authType: template.auth_mode as Extract<typeof template.auth_mode, 'MCP_OAUTH2'>,
                scopes
            });
            if (countDifference > 0) {
                const plural = countDifference > 1 ? 'scopes' : 'scope';
                toast({ title: `Added ${countDifference} new ${plural}`, variant: 'success' });
            } else {
                toast({ title: `Scope successfully removed`, variant: 'success' });
            }
        } catch (err) {
            let errorMessage = 'Failed to update scopes';
            if (err instanceof APIError && err.json.error.message) {
                errorMessage = err.json.error.message;
            }
            throw new Error(errorMessage);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <SettingsField label="Callback URL" htmlFor="callback_url">
                <InputGroup>
                    <InputGroupInput disabled value={callbackUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={callbackUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </SettingsField>

            <SettingsField label="Client ID" htmlFor="client_id">
                {useUserCredentials ? (
                    <EditableInput
                        initialValue={integration.oauth_client_id || ''}
                        onSave={(value) => onSaveCredentials({ clientId: value })}
                        validate={validateNotEmpty}
                        placeholder="Enter your OAuth Client ID"
                    />
                ) : (
                    <InputGroup>
                        <InputGroupInput
                            disabled
                            readOnly
                            value={integration.oauth_client_id || ''}
                            placeholder="Find the Client ID on the developer portal of the external API provider."
                        />
                    </InputGroup>
                )}
            </SettingsField>

            {useUserCredentials ? (
                <SettingsField label="Client secret" htmlFor="client_secret">
                    <EditableInput
                        secret
                        initialValue={integration.oauth_client_secret || ''}
                        onSave={(value) => onSaveCredentials({ clientSecret: value })}
                        validate={validateNotEmpty}
                        placeholder="Enter your OAuth Client Secret"
                    />
                </SettingsField>
            ) : integration.oauth_client_secret ? (
                <SettingsField label="Client secret" htmlFor="client_secret">
                    <InputGroup>
                        <InputGroupInput disabled readOnly type="password" value={integration.oauth_client_secret} />
                        <InputGroupAddon align="inline-end">
                            <CopyButton text={integration.oauth_client_secret} />
                        </InputGroupAddon>
                    </InputGroup>
                </SettingsField>
            ) : null}

            <SettingsField label="Scopes" htmlFor="scopes">
                <ScopesInput scopesString={integration.oauth_scopes || ''} onChange={handleScopesChange} />
            </SettingsField>
        </div>
    );
};
