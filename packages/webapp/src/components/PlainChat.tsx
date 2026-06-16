import { useEffect, useRef } from 'react';

import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { apiFetch } from '@/utils/api';
import { globalEnv } from '@/utils/env';

import type { ApiUser } from '@nangohq/types';

// ─── Plain types ──────────────────────────────────────────────────────────────

declare global {
    interface Window {
        Plain?: {
            init: (config: PlainConfig) => void;
            update: (config: Partial<PlainConfig>) => void;
            setCustomerDetails: (details: PlainCustomerDetails) => void;
            open: () => void;
            close: () => void;
            onOpen: (cb: () => void) => () => void;
            onClose: (cb: () => void) => () => void;
            isInitialized: () => boolean;
            exportDebugLogs: () => string[];
        };
    }
}

type PlainIcon =
    | 'bell'
    | 'book'
    | 'bug'
    | 'bulb'
    | 'chat'
    | 'integration'
    | 'discord'
    | 'discord_muted'
    | 'email'
    | 'slack'
    | 'slack_muted'
    | 'link'
    | 'pencil'
    | 'send'
    | 'support'
    | 'error';

interface PlainColorPair {
    light: string;
    dark: string;
}

interface PlainThreadDetails {
    labelTypeIds?: string[];
    priority?: 1 | 2 | 3 | 4;
    tierIdentifier?: { tierId: string } | { externalId: string };
    tenantIdentifier?: { tenantId: string } | { externalId: string };
    externalId?: string;
}

interface PlainFormField {
    type: 'dropdown';
    placeholder?: string;
    options: { icon?: PlainIcon; text: string; threadDetails?: PlainThreadDetails }[];
}

interface PlainChatButton {
    icon?: PlainIcon;
    text: string;
    threadDetails?: PlainThreadDetails;
    form?: { fields: PlainFormField[] };
}

interface PlainCustomerDetails {
    email: string;
    emailHash?: string;
    fullName: string;
}

interface PlainConfig {
    appId: string;
    hideLauncher?: boolean;
    theme?: 'light' | 'dark' | 'auto';
    style?: {
        brandColor?: string | PlainColorPair;
        brandBackgroundColor?: string | PlainColorPair;
        launcherBackgroundColor?: string | PlainColorPair;
        launcherIconColor?: string | PlainColorPair;
    };
    logo?: { url: string; alt?: string };
    links?: { icon?: PlainIcon; text: string; url: string }[];
    entryPoint?: { type: 'default' | 'chat'; externalId?: string; singleChatMode?: boolean };
    embedAt?: Element;
    hideBranding?: boolean;
    position?: { right?: string; bottom?: string; zIndex?: string };
    threadDetails?: PlainThreadDetails;
    chatButtons?: PlainChatButton[];
    customerDetails?: PlainCustomerDetails;
    requireAuthentication?: boolean;
}

const PLAIN_CDN = 'https://chat.cdn-plain.com/index.js';

function buildConfig(appId: string, darkMode: boolean, user?: ApiUser, emailHash?: string): PlainConfig {
    return {
        appId,
        theme: darkMode ? 'dark' : 'light',
        style: {
            brandColor: { light: '#016886', dark: '#00B2E3' },
            brandBackgroundColor: '#02485D',
            launcherBackgroundColor: { light: '#016886', dark: '#00B2E3' },
            launcherIconColor: { light: '#FFFFFF', dark: '#18191B' }
        },
        logo: {
            url: `${window.location.origin}/${darkMode ? 'logo-icon-dark.svg' : 'logo-icon-light.svg'}`,
            alt: 'Nango'
        },
        links: [
            { icon: 'book', text: 'View docs', url: 'https://docs.nango.dev' },
            { icon: 'slack', text: 'Join our Slack', url: 'https://nango.dev/slack' }
        ],
        chatButtons: [
            { icon: 'chat', text: 'Ask a question', threadDetails: {} },
            { icon: 'bulb', text: 'Share feedback', threadDetails: {} }
        ],
        hideBranding: false,
        position: { right: '16px', bottom: '16px', zIndex: '9999' },
        ...(user ? { customerDetails: { email: user.email, emailHash, fullName: user.name } } : { requireAuthentication: true })
    };
}

// ─── PlainChat ────────────────────────────────────────────────────────────────

export const PlainChat: React.FC<{ user?: ApiUser }> = ({ user }) => {
    const appId = globalEnv.publicPlainAppId;
    const darkMode = useThemeStore(darkModeSelector);
    const userRef = useRef(user);
    userRef.current = user;
    const darkModeRef = useRef(darkMode);
    darkModeRef.current = darkMode;
    const emailHashRef = useRef<string | undefined>(undefined);
    const scriptStartedRef = useRef(false);

    useEffect(() => {
        if (!appId) return;

        if (user) {
            apiFetch('/api/v1/plain')
                .then((r) => r.json() as Promise<{ data: { hash: string } }>)
                .then(({ data }) => {
                    emailHashRef.current = data.hash;
                    if (window.Plain) {
                        window.Plain.update({
                            customerDetails: { email: user.email, emailHash: data.hash, fullName: user.name },
                            requireAuthentication: false
                        });
                        return;
                    }
                    loadScript(appId);
                })
                .catch(() => loadScript(appId));
        } else {
            if (window.Plain?.isInitialized()) {
                window.Plain.update({ customerDetails: undefined, requireAuthentication: true });
            } else {
                loadScript(appId);
            }
        }

        function loadScript(id: string) {
            if (scriptStartedRef.current) return;
            scriptStartedRef.current = true;
            const script = document.createElement('script');
            script.src = PLAIN_CDN;
            script.async = true;
            script.onload = () => window.Plain?.init(buildConfig(id, darkModeRef.current, userRef.current, emailHashRef.current));
            document.head.appendChild(script);
        }
    }, [appId, user?.email]);

    useEffect(() => {
        if (window.Plain?.isInitialized()) {
            window.Plain.update({
                theme: darkMode ? 'dark' : 'light',
                logo: {
                    url: `${window.location.origin}/${darkMode ? 'logo-icon-dark.svg' : 'logo-icon-light.svg'}`,
                    alt: 'Nango'
                }
            });
        }
    }, [darkMode]);

    return null;
};
