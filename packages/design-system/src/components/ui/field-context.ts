import * as React from 'react';

export interface FieldContextValue {
    controlId: string;
    descriptionId: string;
    errorId: string;
    invalid: boolean;
    disabled: boolean;
    registerDescription: (id: string | null) => void;
    registerError: (id: string | null) => void;
    registerControl: (key: string) => () => void;
    setControlId: (key: string, id: string | undefined) => void;
    primaryControlKey: string | null;
    labelTarget: string | undefined;
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

/** Spread after the caller's props: it only sets keys the caller left undefined, so react-hook-form's ids survive. */
export function useFieldControl(props: ControlA11yProps): ControlA11yProps {
    const field = useFieldContext();
    const key = React.useId();
    const registerControl = field?.registerControl;
    const setControlId = field?.setControlId;
    React.useLayoutEffect(() => registerControl?.(key), [registerControl, key]);
    React.useLayoutEffect(() => setControlId?.(key, props.id), [setControlId, key, props.id]);
    // Only the first control: a Field's error describes one input, not every row of a list inside it.
    if (!field || field.primaryControlKey !== key) {
        return {};
    }

    const result: ControlA11yProps = {};
    if (props.id === undefined) {
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
