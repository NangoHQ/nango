import { Link } from 'react-router-dom';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { Avatar } from '@/components/ui/Avatar';
import { useStore } from '@/store';

interface IntegrationLogoWithProfileProps {
    providerConfigKey: string;
    provider: string;
    profile: string;
}

export const IntegrationLogoWithProfile: React.FC<IntegrationLogoWithProfileProps> = ({ providerConfigKey, provider, profile }) => {
    const env = useStore((state) => state.env);

    return (
        <div className="relative w-20 h-17.5">
            <Link to={`/${env}/integrations/${providerConfigKey}`}>
                <IntegrationLogo provider={provider} className="size-15 p-1.5" />
            </Link>
            <Avatar name={profile} className="absolute size-10 bottom-0 right-0" />
        </div>
    );
};
