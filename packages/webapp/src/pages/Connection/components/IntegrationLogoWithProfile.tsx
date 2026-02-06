import { Avatar } from '@/components-v2/Avatar';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';

interface IntegrationLogoWithProfileProps {
    provider: string;
    profile: string;
}

export const IntegrationLogoWithProfile: React.FC<IntegrationLogoWithProfileProps> = ({ provider, profile }) => {
    return (
        <div className="relative w-20 h-17.5">
            <IntegrationLogo provider={provider} className="size-15 p-1.5" />
            <Avatar name={profile} className="absolute size-10 bottom-0 right-0" />
        </div>
    );
};
