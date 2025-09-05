import { Outlet } from '@tanstack/react-router';
import { useRef } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';

import { triggerClose } from '@/lib/events';
import { useGlobal } from '@/lib/store';
import NangoLogoSVG from '@/svg/logo.svg?react';

export const Layout: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);

    const { isEmbedded } = useGlobal();

    useClickAway(ref, () => {
        triggerClose('click:outside');
    });

    useKeyPressEvent('Escape', () => {
        triggerClose('click:outside');
    });

    if (isEmbedded) {
        return (
            <div className="overflow-hidden bg-background w-screen h-screen min-w-[500px] min-h-[600px] flex flex-col rounded-xl text-text-primary">
                <Outlet />
            </div>
        );
    }

    return (
        <div className="absolute h-screen w-screen overflow-hidden flex flex-col justify-center items-center p-14 bg-subtle-light/80 dark:bg-subtle-dark/80">
            <div ref={ref} className="flex flex-col w-[440px] max-h-full rounded-md bg-elevated-light dark:bg-elevated-dark p-px">
                <div className="overflow-scroll bg-surface-light dark:bg-surface-dark text-text-primary rounded-md w-full p-10">
                    <Outlet />
                </div>
                <div className="p-5 w-full text-center">
                    <a className="text-xs text-secondary-light dark:text-secondary-dark" href="https://nango.dev" rel="noopener noreferrer" target="_blank">
                        Secured by
                        <NangoLogoSVG className="h-4 w-auto inline-block ml-2" />
                    </a>
                </div>
            </div>
        </div>
    );
};
