import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { followOAuthRedirect, issueHandoff, OAuthError } from './api';
import { OAuthFailure, OAuthLayout } from './Layout';

import type { PostOAuthHandoff } from '@nangohq/types';

export function OAuthContinue() {
    const [params] = useSearchParams();
    const state = params.get('state') ?? '';
    const navigate = useNavigate();
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    // StrictMode replays effects. Reuse the in-flight issuance so it cannot invalidate
    // its own one-time code by issuing a second one before the browser follows it.
    const request = useRef<{ key: string; promise: Promise<PostOAuthHandoff['Success']> }>();
    useEffect(() => {
        let disposed = false;
        setError(undefined);
        if (!/^[A-Za-z0-9_-]{20,128}$/.test(state)) {
            setError(new OAuthError('invalid_handoff'));
            return;
        }
        const key = `${state}:${attempt}`;
        if (request.current?.key !== key) request.current = { key, promise: issueHandoff(state) };
        void request.current.promise
            .then(({ data }) => {
                if (!disposed) followOAuthRedirect(data.redirectUrl, true);
            })
            .catch((err) => {
                if (disposed) return;
                if (err instanceof OAuthError && err.code === 'unauthorized') {
                    navigate(`/signin?next=${encodeURIComponent(`/oauth/continue?state=${state}`)}`, { replace: true });
                } else setError(err);
            });
        return () => {
            disposed = true;
        };
    }, [state, attempt, navigate]);
    return (
        <OAuthLayout>
            {error ? (
                <OAuthFailure error={error} retry={() => setAttempt((value) => value + 1)} />
            ) : (
                <p role="status" className="text-text-secondary">
                    Continuing securely to Nango…
                </p>
            )}
        </OAuthLayout>
    );
}
