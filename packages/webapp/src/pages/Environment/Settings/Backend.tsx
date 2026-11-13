import { ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Alert, AlertActions, AlertButton, AlertDescription } from '@nangohq/design-system';

import { InlineEditInput } from '@/components/patterns/InlineEditInput';
import { usePermissions } from '@/hooks/usePermissions';
import { APIError } from '@/utils/api';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';

export const BackendSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);

    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Auth callback">
            <SettingsGroup
                label={
                    <>
                        <div className="flex gap-1.5">
                            Callback URL
                            <Link
                                className="flex gap-2 items-center"
                                target="_blank"
                                to="https://nango.dev/docs/guides/auth/auth-guide#custom-oauth-callback-url-optional"
                            >
                                <ExternalLink strokeWidth={1} size={18} />
                            </Link>
                        </div>
                    </>
                }
            >
                <InlineEditInput
                    id="callback_url"
                    mono
                    placeholder="https://api.nango.dev/oauth/callback"
                    value={environmentAndAccount.environment.callback_url}
                    canEdit={canEditEnvironment}
                    onSave={async (value) => {
                        try {
                            await patchEnvironmentAsync({ callback_url: value });
                            toast({ title: 'Successfully updated', variant: 'success' });
                        } catch (err) {
                            if (err instanceof APIError) {
                                toast({ title: err.json.error?.message ?? 'Failed to update', variant: 'error' });
                            } else {
                                toast({ title: 'Failed to update', variant: 'error' });
                            }
                            // Rethrow so InlineEditInput stays in edit mode.
                            throw err;
                        }
                    }}
                    editingFooter={
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>
                                <span>
                                    Changing the callback URL requires an active 308 redirect and updating the registered callback URL with all OAuth API
                                    providers. Otherwise authorization attempts will fail.
                                </span>
                            </AlertDescription>
                            <AlertActions>
                                <AlertButton asChild>
                                    <a
                                        href="https://nango.dev/docs/guides/auth/auth-guide#custom-oauth-callback-url-optional"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View docs
                                        <ExternalLink />
                                    </a>
                                </AlertButton>
                            </AlertActions>
                        </Alert>
                    }
                />
            </SettingsGroup>
        </SettingsContent>
    );
};
