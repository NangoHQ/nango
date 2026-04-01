import { permissions } from '@nangohq/authz';

import { ScopesInput } from '@/components-v2/ScopesInput';
import { Label } from '@/components-v2/ui/label';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const OAuth2CCSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const { can } = usePermissions();
    const canEdit = !environment.is_production || can(permissions.canWriteProdIntegrations);

    const isSharedCredentials = Boolean(integration.shared_credentials_id);

    const handleScopesChange = async (scopes: string, countDifference: number) => {
        try {
            await patchIntegration({
                authType: template.auth_mode as Extract<typeof template.auth_mode, 'OAUTH2_CC'>,
                scopes
            });
            if (countDifference > 0) {
                const plural = countDifference > 1 ? 'scopes' : 'scope';
                toast({ title: `Added ${countDifference} new ${plural}`, variant: 'success' });
            } else {
                toast({ title: `Scope successfully removed`, variant: 'success' });
            }
        } catch (err) {
            toast({ title: 'Failed to update scopes', variant: 'error' });
            throw err;
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-2">
                <Label htmlFor="scopes">Scopes</Label>
                <ScopesInput
                    scopesString={integration.oauth_scopes || ''}
                    onChange={handleScopesChange}
                    isSharedCredentials={isSharedCredentials}
                    readOnly={!canEdit}
                />
            </div>
        </div>
    );
};
