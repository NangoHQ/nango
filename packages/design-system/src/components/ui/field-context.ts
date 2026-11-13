import * as React from 'react';

/**
 * Wiring shared by Field and the controls inside it. Field owns the ids; FieldLabel, FieldDescription and FieldError
 * read them, and Input / InputGroupInput pick up `id`, `aria-describedby` and `aria-invalid` from it.
 *
 * Explicit props always win, so callers that wire ids themselves (the webapp's react-hook-form `Form`) are untouched.
 */
export interface FieldContextValue {
    controlId: string;
    descriptionId: string;
    errorId: string;
    invalid: boolean;
    disabled: boolean;
    /** The id the FieldDescription actually rendered with (an explicit `id` overrides `descriptionId`). */
    registerDescription: (id: string | null) => void;
    registerError: (id: string | null) => void;
    registerControl: (key: string) => () => void;
    setControlId: (key: string, id: string | undefined) => void;
    /** Only the first mounted control takes `controlId`, so a Field holding two inputs never duplicates an id. */
    primaryControlKey: string | null;
    labelTarget: string;
    renderedDescriptionId: string | null;
    renderedErrorId: string | null;
}

export const FieldContext = React.createContext<FieldContextValue | null>(null);

export function useFieldContext(): FieldContextValue | null {
    return React.useContext(FieldContext);
}

interface ControlA11yProps {
    id?: string | undefined;
    'aria-describedby'?: string | undefined;
    'aria-invalid'?: React.AriaAttributes['aria-invalid'];
}

/**
 * Returns the a11y props a control should add when it sits inside a Field. Spread it after the caller's props:
 * every key is only set when the caller left it undefined.
 */
export function useFieldControl(props: ControlA11yProps): ControlA11yProps {
    const field = useFieldContext();
    const key = React.useId();
    const registerControl = field?.registerControl;
    const setControlId = field?.setControlId;
    React.useLayoutEffect(() => registerControl?.(key), [registerControl, key]);
    React.useLayoutEffect(() => setControlId?.(key, props.id), [setControlId, key, props.id]);
    if (!field) {
        return {};
    }

    const result: ControlA11yProps = {};
    if (props.id === undefined && field.primaryControlKey === key) {
        result.id = field.controlId;
    }
    if (props['aria-describedby'] === undefined) {
        const ids = [field.renderedDescriptionId, field.renderedErrorId].filter(Boolean).join(' ');
        if (ids) {
            result['aria-describedby'] = ids;
        }
    }
    if (props['aria-invalid'] === undefined && field.invalid) {
        result['aria-invalid'] = true;
    }
    return result;
}
