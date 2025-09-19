import { Outlet } from '@tanstack/react-router';
import { useRef } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';

import { triggerClose } from '@/lib/events';
import { useGlobal } from '@/lib/store';
import NangoLogoSVG from '@/svg/logo.svg?react';

export const Layout: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);

    const { isEmbedded, showWatermark } = useGlobal();

    useClickAway(ref, () => {
        triggerClose('click:outside');
    });

    useKeyPressEvent('Escape', () => {
        triggerClose('click:outside');
    });

    if (isEmbedded) {
        return (
            <div ref={ref} className="h-screen w-screen flex flex-col max-w-[500px] max-h-[700px] rounded-md bg-elevated p-px">
                <div className="flex-1 w-full bg-surface text-text-primary rounded-md -only:rounded-b-none overflow-y-scroll">
                    <div className="min-h-full overflow-auto p-10 flex flex-col">
                        <Outlet />
                    </div>
                </div>
                {showWatermark && (
                    <div className="p-5 w-full text-center">
                        <a
                            className="shrink-0 text-xs text-text-tertiary"
                            href="https://www.nango.dev?utm_source=connectui"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Secured by
                            <NangoLogoSVG className="h-4 w-auto inline-block ml-2" />
                        </a>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="absolute h-screen w-screen overflow-hidden flex flex-col justify-center items-center p-14 bg-subtle/80">
            <div ref={ref} className="flex flex-col w-[500px] h-[700px] rounded-md bg-elevated p-px">
                <div className="flex-1 w-full bg-surface text-text-primary rounded-md -only:rounded-b-none overflow-y-scroll">
                    <div className="min-h-full overflow-auto p-10 flex flex-col">
                        <Outlet />
                    </div>
                </div>
                {showWatermark && (
                    <div className="p-5 w-full text-center">
                        <a
                            className="shrink-0 text-xs text-text-tertiary"
                            href="https://www.nango.dev?utm_source=connectui"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Secured by
                            <NangoLogoSVG className="h-4 w-auto inline-block ml-2" />
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};
