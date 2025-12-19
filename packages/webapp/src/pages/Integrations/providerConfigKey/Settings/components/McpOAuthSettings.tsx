import { CopyButton } from '@/components-v2/CopyButton';
import { ScopesInput } from '@/components-v2/ScopeInput';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/utils';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const McpOAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const callbackUrl = environment.callback_url || defaultCallback();

    const handleScopesChange = async (scopes: string, countDifference: number) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: template.auth_mode as Extract<typeof template.auth_mode, 'MCP_OAUTH2'>,
            ...(scopes && { scopes })
        });

        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            throw new Error(errorMessage);
        }

        if (countDifference > 0) {
            const plural = countDifference > 1 ? 'scopes' : 'scope';
            toast({ title: `Added ${countDifference} new ${plural}`, variant: 'success' });
        } else {
            toast({ title: `Scope successfully removed`, variant: 'success' });
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
                <InputGroup>
                    <InputGroupInput
                        disabled
                        readOnly
                        value={integration.oauth_client_id || ''}
                        placeholder="Find the Client ID on the developer portal of the external API provider."
                    />
                </InputGroup>
            </div>

            {/* Scopes */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="scopes">Scopes</Label>
                <ScopesInput scopesString={integration.oauth_scopes || ''} onChange={handleScopesChange} />
            </div>
        </div>
    );
};
