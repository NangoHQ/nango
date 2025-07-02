import { useGlobal } from '@/lib/store';
import { IconLock } from '@tabler/icons-react';

export const Watermark: React.FC = () => {
    const { session } = useGlobal();

    if (session?.connectui_settings?.nangoWatermark === false) {
        return null;
    }

    return (
        <div className="relative bottom-5 flex justify-center items-center text-text-muted text-xs">
            <IconLock size={14} />
            <span>
                Secured by{' '}
                <a className="underline" href="https://nango.dev" rel="noopener noreferrer" target="_blank">
                    Nango
                </a>
            </span>
        </div>
    );
};
