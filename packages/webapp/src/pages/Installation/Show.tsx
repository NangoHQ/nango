import { Helmet } from 'react-helmet';

import { Badge, FieldSeparator } from '@nangohq/design-system';

import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { NoticePanel } from '@/components/patterns/NoticePanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useInstallation } from '@/hooks/useInstallation';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardLayout from '@/layout/DashboardLayout';
import { apiErrorCode } from '@/utils/api';
import { globalEnv } from '@/utils/env';

import type { InstallationLicense } from '@nangohq/types';

const formatDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <>
        <span className="type-text-regular-sm text-text-muted">{label}</span>
        <div className="type-text-regular-sm text-text-strong">{children}</div>
    </>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="flex flex-col gap-4">
        <h2 className="type-heading-sm text-text-strong">{title}</h2>
        <div className="grid max-w-[700px] grid-cols-[237px_1fr] items-center gap-x-6 gap-y-3">{children}</div>
    </div>
);

const LicenseStatus: React.FC<{ license: InstallationLicense }> = ({ license }) => {
    switch (license.status) {
        case 'valid':
            return <Badge variant="success">Valid</Badge>;
        case 'expired':
            return <Badge variant="warning">Expired, in grace period</Badge>;
        case 'grace_ended':
            return <Badge variant="danger">Expired, grace period ended</Badge>;
        case 'invalid':
            return <Badge variant="danger">Invalid</Badge>;
        case 'missing':
            return <Badge variant="danger">Not set</Badge>;
    }
};

const LicenseRows: React.FC<{ license: InstallationLicense }> = ({ license }) => {
    if (license.status === 'missing' || license.status === 'invalid') {
        return (
            <Row label="Status">
                <div className="flex flex-col gap-1">
                    <LicenseStatus license={license} />
                    <span className="text-text-secondary">
                        {license.status === 'missing' ? 'NANGO_LICENSE is not set in the instance environment.' : license.reason}
                    </span>
                </div>
            </Row>
        );
    }
    const { name, installation_id, issued_at, expires_at, grace_until, telemetry } = license.license;
    return (
        <>
            <Row label="Status">
                <LicenseStatus license={license} />
            </Row>
            <Row label="Licensed to">{name}</Row>
            <Row label="Installation ID">
                <code className="type-code-regular-xs">{installation_id}</code>
            </Row>
            <Row label="Issued">{formatDay(issued_at)}</Row>
            <Row label="Expires">{formatDay(expires_at)}</Row>
            <Row label="Grace period until">{formatDay(grace_until)}</Row>
            <Row label="Telemetry">{telemetry ? 'Enabled' : 'Disabled'}</Row>
        </>
    );
};

const Notice: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <DashboardLayout width="wide">
        <Helmet>
            <title>Installation info - Nango</title>
        </Helmet>
        <NoticePanel title={title}>{children}</NoticePanel>
    </DashboardLayout>
);

export const InstallationShow: React.FC = () => {
    const { can } = usePermissions();
    const canReadInstallation = can('account:installation:read');
    const { data, error, isLoading } = useInstallation({ enabled: globalEnv.isManaged && canReadInstallation });

    // The menu entry hides on both, but a typed URL lands here. The 400 covers a window env cached from a managed build.
    if (!globalEnv.isManaged || apiErrorCode(error) === 'no_license_public_key') {
        return <Notice title="Not a managed release">Installation info is only available on a managed release of Nango.</Notice>;
    }

    if (!canReadInstallation) {
        return <Notice title="Access denied">Your role does not have access to the installation info.</Notice>;
    }

    if (isLoading) {
        return (
            <DashboardLayout width="wide" className="flex flex-col gap-8">
                <Helmet>
                    <title>Installation info - Nango</title>
                </Helmet>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error || !data) {
        return <ErrorPageComponent title="Installation info" error={error ?? new Error('Failed to load installation info')} />;
    }

    const { version, managedVersion, commit, license } = data.data;

    return (
        <DashboardLayout width="wide" className="flex flex-col gap-8">
            <Helmet>
                <title>Installation info - Nango</title>
            </Helmet>
            <Section title="Software">
                <Row label="Managed release">{managedVersion ?? 'Unknown'}</Row>
                <Row label="Nango version">{version}</Row>
                {commit && (
                    <Row label="Commit">
                        <code className="type-code-regular-xs">{commit}</code>
                    </Row>
                )}
            </Section>
            <FieldSeparator />
            <Section title="License">
                <LicenseRows license={license} />
            </Section>
        </DashboardLayout>
    );
};
