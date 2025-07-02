import { useGlobal } from '@/lib/store';
import NangoLogoSVG from '@/svg/logo.svg?react';

export const Watermark: React.FC = () => {
    const { session } = useGlobal();

    if (session?.connectui_settings?.nangoWatermark === false) {
        return null;
    }

    return (
        <span className="flex flex-row justify-center items-center text-text text-xs">
            Secured by{' '}
            <a href="https://nango.dev" rel="noopener noreferrer" target="_blank">
                <NangoLogoSVG className="h-4 w-auto ml-1.5" />
            </a>
        </span>
    );
};
