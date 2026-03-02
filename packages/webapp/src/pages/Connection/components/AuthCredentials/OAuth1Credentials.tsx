import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { OAuth1Credentials } from '@nangohq/types';

export const OAuth1CredentialsComponent: React.FC<{
    credentials: OAuth1Credentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="oauth_token">OAuth token</Label>
                <SecretInput id="oauth_token" value={credentials.oauth_token} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="oauth_token_secret">OAuth token secret</Label>
                <SecretInput id="oauth_token_secret" value={credentials.oauth_token_secret} disabled copy />
            </div>
        </>
    );
};
