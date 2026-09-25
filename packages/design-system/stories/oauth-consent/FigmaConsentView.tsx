import { ArrowRightLeft, CircleX, Clock3, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '../../src/components/ui/alert';
import { Badge } from '../../src/components/ui/badge';
import { Button } from '../../src/components/ui/button';

import type { OAuthConsentViewProps } from '@/pages/OAuth/Consent';

// Story-only restyle of OAuthConsentView against Figma 1762-347; editing this changes no shipped screen.
export function FigmaConsentView({ state, onRetry, onDecide }: OAuthConsentViewProps) {
    const interaction = state.kind === 'ready' || state.kind === 'submitting' ? state.interaction : state.kind === 'error' ? state.interaction : undefined;

    return (
        <main className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-10 sm:px-6 sm:py-12">
            {state.kind !== 'loading' && (
                <div className="w-full max-w-[400px] rounded-ds-md bg-surface-panel px-8 pt-11 pb-8 shadow-container-panel ring-1 ring-inset ring-border-default">
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
                        <div className="flex flex-col gap-8">
                            <div className="flex items-center justify-center gap-3" aria-hidden="true">
                                <div className="flex size-[42px] items-center justify-center rounded-ds-xs border-ds-hairline border-border-default bg-surface-canvas">
                                    <Terminal className="size-4 text-icon-muted" />
                                </div>
                                <ArrowRightLeft className="size-3 text-icon-muted" />
                                <div className="flex size-[42px] items-center justify-center rounded-ds-xs border-ds-hairline border-border-default bg-surface-canvas">
                                    <img src="/logo-icon-dark.svg" alt="" className="size-[26px]" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-6">
                                <div className="flex flex-col gap-2 text-center">
                                    <h1 className="type-heading-sm text-text-strong">Approve account access</h1>
                                    <p className="type-text-regular-sm text-text-default">
                                        <span className="font-ds-bold break-words">{interaction.client.name}</span> wants to access your{' '}
                                        <span className="font-ds-bold">{interaction.account.name}</span> account.
                                    </p>
                                </div>

                                <section aria-labelledby="requested-access-figma" className="rounded-ds-lg px-3 py-2.5 ring-1 ring-inset ring-border-default">
                                    <div className="flex items-start gap-2">
                                        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-icon-muted" aria-hidden="true" />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                            <div className="flex items-start gap-2">
                                                <h2 id="requested-access-figma" className="type-text-medium-xs min-w-0 flex-1 text-text-default">
                                                    Full access to your dashboard
                                                </h2>
                                                <Badge>read + write</Badge>
                                            </div>
                                            <p className="type-label-xs text-text-secondary">
                                                Read and write everything you can access: integrations, connections, logs, and team settings.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <div className="flex flex-col gap-2">
                                    <p className="type-label-sm text-text-secondary">
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
                                        disabled={state.kind === 'submitting'}
                                        onClick={() => onDecide('deny', interaction)}
                                    >
                                        {state.kind === 'submitting' && state.decision === 'deny' ? 'Denying…' : 'Deny'}
                                    </Button>
                                    <Button
                                        type="button"
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
