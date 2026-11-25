import { FieldError } from '@nangohq/design-system';

import { APIError } from '@/utils/api';

export interface RowError {
    index: number;
    key: 'name' | 'value';
    error: string;
}

export function rowErrorsFromApi(err: unknown, path: string): RowError[] {
    if (!(err instanceof APIError) || err.json.error?.code !== 'invalid_body' || !Array.isArray(err.json.error.errors)) {
        return [];
    }
    return (err.json.error.errors as { path: (string | number)[]; message: string }[])
        .filter((e) => e.path[0] === path)
        .map((e) => ({ index: Number(e.path[1]), key: e.path[2] as RowError['key'], error: e.message }));
}

export const RowErrors: React.FC<{ errors: RowError[] }> = ({ errors }) => {
    if (errors.length === 0) {
        return null;
    }
    return (
        <FieldError>
            <span className="flex flex-col gap-1">
                {errors.map((err, i) => (
                    <span key={i}>
                        Row {err.index + 1}, {err.key}: {err.error}
                    </span>
                ))}
            </span>
        </FieldError>
    );
};
