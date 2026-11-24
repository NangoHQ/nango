import { GithubLogo } from '@/assets/GithubLogo';
import { NotionLogo } from '@/assets/NotionLogo';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';

// Their template logos are dark artwork on a fixed background, so they vanish or box out in one of the themes.
const MONOCHROME_LOGOS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = { github: GithubLogo, notion: NotionLogo };

export const ProviderLogo: React.FC<{ provider: string }> = ({ provider }) => {
    const MonochromeLogo = MONOCHROME_LOGOS[provider];
    // Template logos pad their artwork, so a 25px box draws an 18px logo.
    return MonochromeLogo ? (
        <MonochromeLogo className="-m-[3.5px] size-[25px] shrink-0 text-text-strong" />
    ) : (
        <IntegrationLogo provider={provider} className="-m-[3.5px] size-[25px] shrink-0 border-0 bg-transparent p-0" />
    );
};
