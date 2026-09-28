import { FieldLabel } from '@nangohq/design-system';

/** Label column from the settings frame (Figma Field label, 237px). */
const LABEL_COLUMN = 'w-[237px]';

export function isOAuthCredentials(authMode: string): boolean {
    return authMode === 'TBA' || authMode.startsWith('OAUTH') || authMode.startsWith('MCP_OAUTH');
}

export const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    return (
        <section className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-2">
                <h2 className="type-text-regular-sm text-text-secondary uppercase">{title}</h2>
                <div className="border-b-[0.5px] border-border-default" />
            </div>
            <div className="flex flex-col gap-6">{children}</div>
        </section>
    );
};

export const SettingsField: React.FC<{
    label: string;
    htmlFor?: string;
    info?: React.ReactNode;
    /** `input` lines the label up with a 32px control, even when help text sits below it. */
    align?: 'input' | 'center';
    children: React.ReactNode;
}> = ({ label, htmlFor, info, align = 'input', children }) => {
    return (
        <div className={`flex gap-2 ${align === 'center' ? 'items-center' : 'items-start'}`}>
            <div className={`flex ${LABEL_COLUMN} shrink-0 items-center gap-1.5 ${align === 'input' ? 'h-8' : ''}`}>
                <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
                {info}
            </div>
            <div className="flex w-100 min-w-0 flex-col gap-2">{children}</div>
        </div>
    );
};
