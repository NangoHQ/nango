import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { ScopesInput } from '@/components-v2/ScopesInput';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { defaultCallback } from '@/utils/utils';

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
        } catch (err) {
            let errorMessage = 'Failed to update credentials';
            if (err instanceof APIError) {
                errorMessage = err.message;
            }
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
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
            if (err instanceof APIError) {
                errorMessage = err.message;
            }
            throw new Error(errorMessage);
        }
    };

    return (
        <div className="flex flex-col gap-10">
            {/* Callback URL */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="callback_url">Callback URL</Label>
                <InputGroup>
                    <InputGroupInput disabled value={callbackUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={callbackUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {/* Client ID */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_id">Client ID</Label>
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
            </div>

            {/* Client Secret (only when user provides credentials) */}
            {useUserCredentials && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="client_secret">Client Secret</Label>
                    <EditableInput
                        secret
                        initialValue={integration.oauth_client_secret || ''}
                        onSave={(value) => onSaveCredentials({ clientSecret: value })}
                        validate={validateNotEmpty}
                        placeholder="Enter your OAuth Client Secret"
                    />
                </div>
            )}

            {/* Scopes */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="scopes">Scopes</Label>
                <ScopesInput scopesString={integration.oauth_scopes || ''} onChange={handleScopesChange} />
            </div>
        </div>
    );
};
