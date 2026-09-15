import { CircleX, Clock3, ExternalLink, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle, Button } from '@nangohq/design-system';

import { apiFetch } from '@/utils/api';
import { globalEnv } from '@/utils/env';

import type { GetOAuthConsentInteraction, OAuthConsentInteraction, PostOAuthConsentDecision } from '@nangohq/types';

type ConsentResponse = Extract<GetOAuthConsentInteraction['Reply'], { status: 200 }>['body'];
type LoginResumeResponse = Extract<GetOAuthConsentInteraction['Reply'], { status: 202 }>['body'];
type DecisionResponse = Extract<PostOAuthConsentDecision['Reply'], { status: 200 }>['body'];

type PageState =
    | { kind: 'loading' }
    | { kind: 'ready'; interaction: OAuthConsentInteraction }
    | { kind: 'submitting'; interaction: OAuthConsentInteraction; decision: 'approve' | 'deny' }
    | { kind: 'expired' | 'completed' | 'unavailable' }
    | { kind: 'error'; interaction?: OAuthConsentInteraction };

export function OAuthConsent() {
    const { uid } = useParams<{ uid: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const [state, setState] = useState<PageState>({ kind: 'loading' });
    const requestSequence = useRef(0);

    const issuer = globalEnv.oauthServerUrl;
    const loadInteraction = useCallback(async () => {
        const sequence = ++requestSequence.current;
        setState({ kind: 'loading' });
        if (!uid || !issuer) {
            setState({ kind: 'unavailable' });
            return;
        }

        try {
            const response = await apiFetch(new URL(`/oauth/consent/${encodeURIComponent(uid)}`, issuer));
            const json: unknown = await response.json();
            if (sequence !== requestSequence.current) return;

            if (response.status === 202) {
                window.location.assign((json as LoginResumeResponse).data.resumeUrl);
                return;
            }
            if (response.status === 401) {
                void navigate(`/signin?next=${encodeURIComponent(location.pathname)}`, { replace: true });
                return;
            }
            if (response.status === 409) {
                setState({ kind: 'completed' });
                return;
            }
            if (response.status === 410) {
                setState({ kind: 'expired' });
                return;
            }
            if (response.status === 403) {
                setState({ kind: 'unavailable' });
                return;
            }
            if (!response.ok) {
                setState({ kind: 'error' });
                return;
            }
            setState({ kind: 'ready', interaction: (json as ConsentResponse).data });
        } catch {
            if (sequence === requestSequence.current) setState({ kind: 'error' });
        }
    }, [issuer, location.pathname, navigate, uid]);

    useEffect(() => {
        void loadInteraction();
        return () => {
            requestSequence.current += 1;
        };
    }, [loadInteraction]);

    const decide = async (decision: 'approve' | 'deny', interaction: OAuthConsentInteraction) => {
        if (!uid || !issuer || state.kind === 'submitting') return;
        setState({ kind: 'submitting', interaction, decision });
        try {
            const response = await apiFetch(new URL(`/oauth/consent/${encodeURIComponent(uid)}/${decision}`, issuer), { method: 'POST' });
            const json: unknown = await response.json();
            if (response.status === 409) {
                setState({ kind: 'completed' });
                return;
            }
            if (response.status === 410) {
                setState({ kind: 'expired' });
                return;
            }
            if (!response.ok) {
                setState({ kind: response.status === 403 ? 'unavailable' : 'error', interaction });
                return;
            }
            window.location.assign((json as DecisionResponse).data.resumeUrl);
        } catch {
            setState({ kind: 'error', interaction });
        }
    };

    const interaction = state.kind === 'ready' || state.kind === 'submitting' ? state.interaction : state.kind === 'error' ? state.interaction : undefined;

    return (
        <main className="min-h-screen bg-bg-elevated flex items-center justify-center px-4 py-8 sm:px-6">
            <Helmet>
                <title>Authorize access - Nango</title>
            </Helmet>
            <div className="w-full max-w-[560px] rounded-xl border border-border-muted bg-bg-base shadow-sm overflow-hidden">
                <header className="flex items-center gap-3 border-b border-border-muted px-5 py-4 sm:px-7">
                    <img src="/logo-icon-dark.svg" alt="Nango" className="h-8 w-8" />
                    <div>
                        <p className="text-body-small-regular text-text-muted">Nango authorization</p>
                        <h1 className="text-title-subsection text-text-strong">Approve account access</h1>
                    </div>
                </header>

                <div className="px-5 py-6 sm:px-7 sm:py-7">
                    {state.kind === 'loading' && <Status icon={<Loader2 className="animate-spin" />} title="Loading authorization request…" />}
                    {state.kind === 'expired' && (
                        <Status icon={<Clock3 />} title="This request has expired" description="Return to the application and start again." />
                    )}
                    {state.kind === 'completed' && (
                        <Status
                            icon={<ShieldCheck />}
                            title="This request was already completed"
                            description="You can close this window or return to the application."
                        />
                    )}
                    {state.kind === 'unavailable' && (
                        <Status icon={<TriangleAlert />} title="Authorization is unavailable" description="OAuth consent is not available right now." />
                    )}
                    {state.kind === 'error' && !interaction && (
                        <div className="flex flex-col gap-5">
                            <Alert variant="danger">
                                <CircleX />
                                <AlertTitle>Couldn&apos;t load the request</AlertTitle>
                                <AlertDescription>No access was granted. Check your connection and try again.</AlertDescription>
                            </Alert>
                            <Button type="button" onClick={() => void loadInteraction()}>
                                Try again
                            </Button>
                        </div>
                    )}

                    {interaction && (
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <p className="text-body-large-semibold text-text-strong break-words">{interaction.client.name}</p>
                                <p className="text-body-medium-regular text-text-secondary">
                                    wants access to the <span className="font-medium text-text-strong">{interaction.account.name}</span> account.
                                </p>
                            </div>

                            <Alert variant="warning">
                                <TriangleAlert />
                                <AlertTitle>Application identity is not verified</AlertTitle>
                                <AlertDescription>
                                    Client metadata is provided by {interaction.client.hostname}. Only continue if you recognize this application and callback.
                                </AlertDescription>
                            </Alert>

                            <section aria-labelledby="requested-access" className="flex flex-col gap-3">
                                <h2 id="requested-access" className="text-body-medium-semibold text-text-strong">
                                    Requested access
                                </h2>
                                <div className="rounded-lg border border-border-muted bg-bg-elevated px-4 py-3">
                                    <p className="text-body-medium-semibold text-text-strong break-all">{interaction.resource.hostname}</p>
                                    <ul className="mt-2 flex flex-col gap-1" aria-label={`Capabilities for ${interaction.resource.hostname}`}>
                                        {interaction.resource.scopes.map((scope) => (
                                            <li key={scope} className="text-body-small-regular text-text-secondary break-all">
                                                {scope === 'environment:*' ? 'Access every environment allowed by your current Nango role' : scope}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="text-body-small-regular text-text-muted">
                                    Access follows your live Nango permissions. New access may become available after role changes, and removed access stops
                                    working on the next request.
                                </p>
                            </section>

                            <div className="rounded-lg border border-border-muted px-4 py-3">
                                <p className="text-body-small-regular text-text-muted">Callback</p>
                                <p className="text-body-medium-regular text-text-strong break-all">{interaction.callbackHostname}</p>
                            </div>

                            {state.kind === 'error' && (
                                <Alert variant="danger">
                                    <CircleX />
                                    <AlertDescription>The request couldn&apos;t be completed. No new access was granted; you can try again.</AlertDescription>
                                </Alert>
                            )}

                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={state.kind === 'submitting'}
                                    onClick={() => void decide('deny', interaction)}
                                >
                                    {state.kind === 'submitting' && state.decision === 'deny' ? 'Denying…' : 'Deny'}
                                </Button>
                                <Button
                                    type="button"
                                    disabled={state.kind === 'submitting'}
                                    loading={state.kind === 'submitting' && state.decision === 'approve'}
                                    onClick={() => void decide('approve', interaction)}
                                >
                                    {state.kind === 'submitting' && state.decision === 'approve' ? 'Approving…' : 'Approve access'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                <footer className="border-t border-border-muted px-5 py-3 sm:px-7">
                    <a
                        className="inline-flex items-center gap-1 text-body-small-regular text-text-muted hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        href="https://docs.nango.dev"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Learn about Nango authorization <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                </footer>
            </div>
        </main>
    );
}

function Status({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
    return (
        <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
            <div className="text-text-muted" aria-hidden="true">
                {icon}
            </div>
            <h2 className="text-title-subsection text-text-strong">{title}</h2>
            {description && <p className="max-w-sm text-body-medium-regular text-text-secondary">{description}</p>}
        </div>
    );
}
