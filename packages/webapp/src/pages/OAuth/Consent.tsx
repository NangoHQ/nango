import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { track } from '@/utils/analytics';
import { decideInteraction, followOAuthRedirect, OAuthError, readInteraction } from './api';
import { OAuthFailure, OAuthLayout } from './Layout';

import type { OAuthConsentInteraction } from '@nangohq/types';

export function OAuthConsent() {
    const { uid = '' } = useParams();
    const [interaction, setInteraction] = useState<OAuthConsentInteraction>();
    const [error, setError] = useState<unknown>();
    const [attempt, setAttempt] = useState(0);
    const [pending, setPending] = useState<'approve' | 'deny'>();
    const submitting = useRef(false);

    useEffect(() => {
        let disposed = false;
        setError(undefined);
        setInteraction(undefined);
        void readInteraction(uid).then(
            ({ data }) => {
                if (!disposed) setInteraction(data);
            },
            (err) => {
                if (!disposed) setError(err);
            }
        );
        return () => {
            disposed = true;
        };
    }, [uid, attempt]);

    useEffect(() => {
        if (!interaction) return;
        const timer = window.setTimeout(
            () => setError(new OAuthError('interaction_expired')),
            Math.max(0, new Date(interaction.expiresAt).getTime() - Date.now())
        );
        return () => window.clearTimeout(timer);
    }, [interaction]);

    async function decide(approve: boolean) {
        if (!interaction || submitting.current) return;
        submitting.current = true;
        setPending(approve ? 'approve' : 'deny');
        track('web:oauth:consent_decided', { decision: approve ? 'approve' : 'deny' });
        try {
            const { data } = await decideInteraction(uid, interaction.csrfToken, approve);
            followOAuthRedirect(data.redirectUrl);
        } catch (err) {
            setError(err);
            setPending(undefined);
            submitting.current = false;
        }
    }

    return (
        <OAuthLayout>
            {error ? (
                <OAuthFailure error={error} retry={() => setAttempt((value) => value + 1)} />
            ) : !interaction ? (
                <p role="status" className="text-text-secondary">
                    Loading authorization request…
                </p>
            ) : (
                <>
                    <h1 className="text-title-group text-text-strong">Authorize access</h1>
                    <div className="space-y-2 text-body-base text-text-secondary">
                        <p>
                            <strong className="break-words text-text-strong" dir="auto">
                                {interaction.clientName}
                            </strong>{' '}
                            wants to access your Nango account.
                        </p>
                        <dl className="space-y-2 rounded border border-border-muted p-4">
                            <div>
                                <dt className="text-text-secondary">Application website</dt>
                                <dd className="break-all text-text-strong">{interaction.clientHostname}</dd>
                            </div>
                            <div>
                                <dt className="text-text-secondary">Callback hostname</dt>
                                <dd className="break-all text-text-strong">{interaction.callbackHostname}</dd>
                            </div>
                            <div>
                                <dt className="text-text-secondary">Nango account</dt>
                                <dd className="break-words text-text-strong" dir="auto">
                                    {interaction.accountName}
                                </dd>
                            </div>
                        </dl>
                        <p className="text-body-small">
                            The application supplies its own name and metadata. Nango has not verified its identity. Only approve applications you trust.
                        </p>
                    </div>
                    <section aria-labelledby="oauth-resources" className="space-y-3">
                        <h2 id="oauth-resources" className="text-body-base font-semibold text-text-strong">
                            Requested access
                        </h2>
                        {interaction.resources.map((resource) => (
                            <div key={resource.resource} className="space-y-2 rounded border border-border-muted p-4">
                                <h3 className="break-all text-body-base text-text-strong">{resource.resource}</h3>
                                <ul className="list-disc space-y-1 pl-5 text-body-base text-text-secondary">
                                    {resource.scopes.map((scope) => (
                                        <li key={scope} className="break-words">
                                            <code>{scope}</code>
                                            {scope === 'environment:*' && ' — access environments within your current Nango permissions'}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </section>
                    {interaction.resources.some((resource) => resource.scopes.includes('environment:*')) && (
                        <section aria-labelledby="oauth-permissions" className="space-y-2 text-body-base text-text-secondary">
                            <h2 id="oauth-permissions" className="font-semibold text-text-strong">
                                Your permissions remain in control
                            </h2>
                            <p>
                                Management access covers every environment you can access, not a fixed list. New environments and role promotions may expand
                                access. Role downgrades, suspension, account removal and environment deletion reduce access on the next request.
                            </p>
                            <p>The application can keep access when you sign out. Changing or resetting your password revokes this authorization.</p>
                        </section>
                    )}
                    <div className="flex flex-wrap justify-end gap-3" aria-busy={Boolean(pending)}>
                        <Button variant="outline" disabled={Boolean(pending)} loading={pending === 'deny'} onClick={() => void decide(false)}>
                            Deny
                        </Button>
                        <Button disabled={Boolean(pending)} loading={pending === 'approve'} onClick={() => void decide(true)}>
                            Approve access
                        </Button>
                    </div>
                    {pending && (
                        <p role="status" className="text-body-small text-text-secondary">
                            Completing authorization…
                        </p>
                    )}
                </>
            )}
        </OAuthLayout>
    );
}
