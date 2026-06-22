import { Outlet } from '@tanstack/react-router';
import { FocusTrap } from 'focus-trap-react';
import { useRef } from 'react';
import { useClickAway, useKeyPressEvent } from 'react-use';

import { triggerClose } from '@/lib/events';
import { useI18n } from '@/lib/i18n';
import { useGlobal } from '@/lib/store';
import NangoLogoSVG from '@/svg/logo.svg?react';

// Trap focus inside the dialog without disturbing Layout's own Escape / click-away close behaviour:
// don't auto-grab focus, let outside clicks through, and leave Escape to the Layout handler.
const focusTrapOptions = {
    escapeDeactivates: false,
    allowOutsideClick: true,
    initialFocus: false,
    // Must resolve to an element INSIDE the trap container (the wrapper below), otherwise on a
    // zero-tabbable screen focus-trap focuses an ancestor and its containment check thrashes.
    fallbackFocus: '#connect-ui-dialog-content'
} as const;

export const Layout: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);

    const { isEmbedded, showWatermark, isAuthLink } = useGlobal();
    const { t } = useI18n();
    const isDarkTheme = document.documentElement.classList.contains('dark');

    useClickAway(ref, (event: MouseEvent | TouchEvent) => {
        const target = event.target instanceof Element ? event.target : null;

        if (target?.closest('[data-slot="select-content"]')) return;

        if (target === document.documentElement) {
            const rect = ref.current?.getBoundingClientRect();
            if (rect) {
                const point = 'changedTouches' in event ? event.changedTouches[0] : event;
                if (point.clientX >= rect.left && point.clientX <= rect.right && point.clientY >= rect.top && point.clientY <= rect.bottom) {
                    return;
                }
            }
        }

        triggerClose('click:outside');
    });

    useKeyPressEvent('Escape', () => {
        triggerClose('click:outside');
    });

    if (isEmbedded) {
        return (
            <div
                ref={ref}
                aria-label={t('common.dialogLabel')}
                aria-labelledby="connect-ui-title"
                aria-modal="true"
                className="h-screen w-screen flex flex-col max-w-[500px] max-h-[700px] rounded-md bg-elevated p-px overflow-hidden"
                id="connect-ui-dialog"
                role="dialog"
                tabIndex={-1}
            >
                <FocusTrap focusTrapOptions={focusTrapOptions}>
                    <div className="contents" id="connect-ui-dialog-content" tabIndex={-1}>
                        <div className="flex-1 w-full bg-surface text-text-primary rounded-md -only:rounded-b-none overflow-y-auto">
                            <div className="min-h-full p-10 flex flex-col">
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
                                    <NangoLogoSVG aria-hidden="true" className="h-4 w-auto inline-block ml-2" />
                                </a>
                            </div>
                        )}
                    </div>
                </FocusTrap>
            </div>
        );
    }

    return (
        <div
            className={`absolute h-screen w-screen overflow-hidden flex flex-col justify-center items-center sm:p-14 ${isAuthLink ? (isDarkTheme ? 'bg-black' : 'bg-gray-100') : 'bg-subtle/80'}`}
        >
            <div
                ref={ref}
                aria-label={t('common.dialogLabel')}
                aria-labelledby="connect-ui-title"
                aria-modal="true"
                className="flex flex-col w-full h-full sm:w-[500px] sm:h-[700px] sm:rounded-md bg-elevated p-px overflow-hidden"
                id="connect-ui-dialog"
                role="dialog"
                tabIndex={-1}
            >
                <FocusTrap focusTrapOptions={focusTrapOptions}>
                    <div className="contents" id="connect-ui-dialog-content" tabIndex={-1}>
                        <div className="flex-1 w-full bg-surface text-text-primary sm:rounded-md -only:rounded-b-none overflow-y-auto">
                            <div className="min-h-full p-5 sm:p-10 flex flex-col">
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
                                    <NangoLogoSVG aria-hidden="true" className="h-4 w-auto inline-block ml-2" />
                                </a>
                            </div>
                        )}
                    </div>
                </FocusTrap>
            </div>
        </div>
    );
};
