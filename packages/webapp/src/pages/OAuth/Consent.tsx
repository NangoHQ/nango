import { ArrowRightLeft, CircleX, Clock3, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@nangohq/design-system';

import { apiFetch } from '@/utils/api';
import { globalEnv } from '@/utils/env';

import type { GetOAuthConsentInteraction, OAuthConsentInteraction, PostOAuthConsentDecision, PostOAuthConsentLogin } from '@nangohq/types';

type ConsentResponse = Extract<GetOAuthConsentInteraction['Reply'], { status: 200 }>['body'];
type LoginResumeResponse = Extract<GetOAuthConsentInteraction['Reply'], { status: 202 }>['body'];
type LoginResponse = Extract<PostOAuthConsentLogin['Reply'], { status: 200 }>['body'];
type DecisionResponse = Extract<PostOAuthConsentDecision['Reply'], { status: 200 }>['body'];

export type PageState =
    | { kind: 'loading' }
    | { kind: 'ready'; interaction: OAuthConsentInteraction }
    | { kind: 'submitting'; interaction: OAuthConsentInteraction; decision: 'approve' | 'deny' }
    | { kind: 'expired' | 'completed' | 'invalid' | 'unavailable' }
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
            if (sequence !== requestSequence.current) return;

            if (response.status === 202) {
                const json = (await response.json()) as LoginResumeResponse;
                window.location.assign((json as LoginResumeResponse).data.resumeUrl);
                return;
            }
            if (response.status === 204) {
                const loginResponse = await apiFetch(new URL(`/oauth/consent/${encodeURIComponent(uid)}/login`, issuer), { method: 'POST' });
                if (sequence !== requestSequence.current) return;
                if (loginResponse.status === 401) {
                    void navigate(`/signin?next=${encodeURIComponent(location.pathname)}`, { replace: true });
                    return;
                }
                if (loginResponse.status === 409) {
                    setState({ kind: 'completed' });
                    return;
                }
                if (loginResponse.status === 410) {
                    setState({ kind: 'expired' });
                    return;
                }
                if (!loginResponse.ok) {
                    setState({ kind: loginResponse.status === 403 ? 'unavailable' : 'error' });
                    return;
                }
                const loginJson = (await loginResponse.json()) as LoginResponse;
                window.location.assign(loginJson.data.resumeUrl);
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
            if (response.status === 404) {
                setState({ kind: 'invalid' });
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
            const json = (await response.json()) as ConsentResponse;
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
            if (response.status === 409) {
                setState({ kind: 'completed' });
                return;
            }
            if (response.status === 410) {
                setState({ kind: 'expired' });
                return;
            }
            if (response.status === 401) {
                void navigate(`/signin?next=${encodeURIComponent(location.pathname)}`, { replace: true });
                return;
            }
            if (response.status === 404) {
                setState({ kind: 'invalid' });
                return;
            }
            if (!response.ok) {
                setState({ kind: response.status === 403 ? 'unavailable' : 'error', interaction });
                return;
            }
            const json = (await response.json()) as DecisionResponse;
            window.location.assign(json.data.resumeUrl);
        } catch {
            setState({ kind: 'error', interaction });
        }
    };

    return <OAuthConsentView state={state} onRetry={() => void loadInteraction()} onDecide={(decision, target) => void decide(decision, target)} />;
}

export interface OAuthConsentViewProps {
    state: PageState;
    onRetry: () => void;
    onDecide: (decision: 'approve' | 'deny', interaction: OAuthConsentInteraction) => void;
}

export function OAuthConsentView({ state, onRetry, onDecide }: OAuthConsentViewProps) {
    const interaction = state.kind === 'ready' || state.kind === 'submitting' ? state.interaction : state.kind === 'error' ? state.interaction : undefined;

    return (
        <main className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-10 sm:px-6 sm:py-12">
            <Helmet>
                <title>Authorize access - Nango</title>
            </Helmet>
            {state.kind !== 'loading' && (
                <div className="w-full max-w-[520px] rounded-ds-sm bg-surface-panel px-6 py-10 shadow-container-panel ring-1 ring-inset ring-border-default sm:px-8 sm:py-10">
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
                    {state.kind === 'invalid' && (
                        <Status icon={<TriangleAlert />} title="This request is no longer valid" description="Return to the application and start again." />
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
                            <Button type="button" onClick={onRetry}>
                                Try again
                            </Button>
                        </div>
                    )}

                    {interaction && (
                        <div className="flex flex-col gap-10">
                            <div className="flex items-center justify-center gap-3" aria-hidden="true">
                                <div className="flex size-12 items-center justify-center rounded-ds-xs border-ds-hairline border-border-default bg-surface-canvas">
                                    <Terminal className="size-5 text-icon-muted" />
                                </div>
                                <ArrowRightLeft className="size-4 text-icon-muted" />
                                <div className="flex size-12 items-center justify-center rounded-ds-xs border-ds-hairline border-border-default bg-surface-canvas">
                                    <img src="/logo-icon-dark.svg" alt="" className="size-7" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-8">
                                <div className="flex flex-col gap-2 text-center">
                                    <h1 className="type-heading-md text-text-strong">Approve account access</h1>
                                    <p className="type-text-regular-md text-text-default">
                                        <span className="font-ds-bold break-words">{interaction.client.name}</span> wants to access your{' '}
                                        <span className="font-ds-bold">{interaction.account.name}</span> account.
                                    </p>
                                </div>

                                <section aria-labelledby="requested-access" className="rounded-ds-sm p-4 ring-1 ring-inset ring-border-default">
                                    <div className="flex items-start gap-3">
                                        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-icon-muted" aria-hidden="true" />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <div className="flex items-start gap-2">
                                                <h2 id="requested-access" className="type-text-medium-md min-w-0 flex-1 text-text-default">
                                                    Full access to your dashboard
                                                </h2>
                                                <Badge>read + write</Badge>
                                            </div>
                                            <p className="type-text-regular-sm text-text-secondary">
                                                Read and write everything you can access: integrations, connections, logs, and team settings.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <div className="flex flex-col gap-3">
                                    <p className="type-text-regular-sm text-text-secondary">
                                        Access matches your live Nango role. If your role changes, so does what this token can reach.
                                    </p>
                                    <Alert variant="warning" size="compact">
                                        <TriangleAlert />
                                        <AlertTitle>Application identity not verified</AlertTitle>
                                        <AlertDescription>
                                            <span className="flex min-w-0 flex-col">
                                                <span>
                                                    This client is registered by {interaction.client.hostname}, not Nango. Only approve if you recognize this
                                                    application and trust where it redirects:
                                                </span>
                                                <strong className="font-ds-bold text-status-warning-text break-all">{interaction.redirectUri}</strong>
                                            </span>
                                        </AlertDescription>
                                    </Alert>
                                </div>

                                {state.kind === 'error' && (
                                    <Alert variant="danger" size="compact">
                                        <CircleX />
                                        <AlertDescription>
                                            The request couldn&apos;t be completed. No new access was granted; you can try again.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <div className="flex items-center justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="lg"
                                        disabled={state.kind === 'submitting'}
                                        onClick={() => onDecide('deny', interaction)}
                                    >
                                        {state.kind === 'submitting' && state.decision === 'deny' ? 'Denying…' : 'Deny'}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="lg"
                                        disabled={state.kind === 'submitting'}
                                        loading={state.kind === 'submitting' && state.decision === 'approve'}
                                        onClick={() => onDecide('approve', interaction)}
                                    >
                                        {state.kind === 'submitting' && state.decision === 'approve' ? 'Approving…' : 'Approve access'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}

function Status({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
    return (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center" role="status">
            <div className="text-text-muted" aria-hidden="true">
                {icon}
            </div>
            <h2 className="text-title-subsection text-text-strong">{title}</h2>
            {description && <p className="max-w-sm text-body-medium-regular text-text-secondary">{description}</p>}
        </div>
    );
}
