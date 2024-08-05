import type { GetIntegration } from '@nangohq/types';
import type { EnvironmentAndAccount } from '@nangohq/server';
import Info from '../../../../../components/ui/Info';

export const SettingsAPIKey: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data: { integration }
}) => {
    return (
        <div className="mt-10">
            <Info size={20} color="blue" padding="p-2" classNames="text-sm">
                The &quot;{integration?.provider}&quot; integration uses API Keys for authentication (
                <a
                    href="https://docs.nango.dev/integrate/guides/authorize-an-api"
                    className="text-white underline hover:text-text-light-blue"
                    rel="noreferrer"
                    target="_blank"
                >
                    docs
                </a>
                )
            </Info>
        </div>
    );
};
