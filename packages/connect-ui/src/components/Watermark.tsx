import { useGlobal } from '@/lib/store';
import { IconLock } from '@tabler/icons-react';

export const Watermark: React.FC = () => {
    const { session } = useGlobal();

    if (session?.connectui_settings?.nangoWatermark === false) {
        return null;
    }

    return (
        <div className="w-full flex justify-center items-center mb-6 gap-1 text-text-muted text-xs">
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
