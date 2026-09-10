import { Helmet } from 'react-helmet';

import { Alert, AlertDescription, Button } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { OAuthError } from './api';

import type { ReactNode } from 'react';

export function OAuthLayout({ children }: { children: ReactNode }) {
    return (
        <main className="min-h-screen w-full bg-surface-canvas px-4 py-8 sm:py-16">
            <Helmet>
                <title>Authorize access - Nango</title>
                <meta name="referrer" content="no-referrer" />
            </Helmet>
            <div className="mx-auto flex max-w-xl flex-col gap-6 rounded-lg border border-border-muted bg-surface-page p-6 sm:p-8">
                <div className="flex items-center gap-3 text-text-strong">
                    <LogoInverted className="size-8" />
                    <span className="text-title-group">Nango</span>
                </div>
                {children}
            </div>
        </main>
    );
}

export function OAuthFailure({ error, retry }: { error: unknown; retry: () => void }) {
    const code = error instanceof OAuthError ? error.code : 'server_error';
    const completed = code === 'interaction_completed';
    const expired = ['interaction_expired', 'invalid_handoff'].includes(code);
    const unavailable = ['unauthorized', 'forbidden', 'feature_disabled', 'invalid_interaction'].includes(code);
    const recoverable = !completed && !expired && !unavailable;
    return (
        <>
            <h1 className="text-title-group text-text-strong">
                {completed
                    ? 'Request already completed'
                    : expired
                      ? 'Request expired'
                      : unavailable
                        ? 'Authorization unavailable'
                        : 'Unable to load this request'}
            </h1>
            <Alert variant={completed ? 'info' : 'danger'}>
                <AlertDescription>
                    {completed
                        ? 'This authorization request has already been handled. You can close this tab.'
                        : recoverable
                          ? 'There was a connection problem. Try again to check the status of your request.'
                          : 'Return to the application and start a new authorization request.'}
                </AlertDescription>
            </Alert>
            {recoverable && (
                <div>
                    <Button variant="outline" onClick={retry}>
                        Try again
                    </Button>
                </div>
            )}
        </>
    );
}
