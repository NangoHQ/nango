export class ParserError {
    code;
    message: string;
    path: string;

    constructor({ code, message, path }: { code: string; message: string; path: string[] }) {
        this.code = code;
        this.message = message;
        this.path = path.join(' > ');
    }
}

export class ParserErrorInvalidModelName extends ParserError {
    constructor(options: { model: string; path: string[] }) {
        super({
            code: 'invalid_model_name',
            message: `Model "${options.model}" contains invalid characters`,
            path: options.path
        });
    }
}

export class ParserErrorDuplicateModel extends ParserError {
    constructor(options: { model: string; path: string[] }) {
        super({
            code: 'duplicate_model',
            message: `Model "${options.model}" is used multiple times. Please make sure all models are unique within an integration.`,
            path: options.path
        });
    }
}

export class ParserErrorModelNotFound extends ParserError {
    constructor(options: { model: string; path: string[] }) {
        super({
            code: 'model_not_found',
            message: `Model "${options.model}" does not exists`,
            path: options.path
        });
    }
}

export class ParserErrorMissingId extends ParserError {
    constructor(options: { model: string; path: string[] }) {
        super({
            code: 'model_missing_id',
            message: `Model "${options.model}" doesn't have an id field. This is required to be able to uniquely identify the data record`,
            path: options.path
        });
    }
}

export class ParserErrorDuplicateEndpoint extends ParserError {
    constructor(options: { endpoint: string; path: string[] }) {
        super({
            code: 'duplicate_endpoint',
            message: `Endpoint "${options.endpoint}" is used multiple times. Please make sure all endpoints are unique.`,
            path: options.path
        });
    }
}

export class ParserErrorEndpointsMismatch extends ParserError {
    constructor(options: { syncName: string; path: string[] }) {
        super({
            code: 'endpoints_mismatch',
            message: `The number of endpoints doesn't match the number of models returned by "${options.syncName}". The endpoints to model should match 1 to 1.`,
            path: options.path
        });
    }
}

export class ParserErrorInvalidRuns extends ParserError {
    constructor(options: { message: string; path: string[] }) {
        super({
            code: 'invalid_runs',
            message: options.message,
            path: options.path
        });
    }
}

export class ParserErrorModelIsLiteral extends ParserError {
    constructor(options: { model: string; path: string[] }) {
        super({
            code: 'model_is_literal',
            message: `A literal type "${options.model}" was parsed, which might be an error. It is recommended to use a Model for input and output.`,
            path: options.path
        });
    }
}

export class ParserErrorCycle extends ParserError {
    constructor(options: { stack: Set<string> }) {
        const arr = Array.from(options.stack);
        const start = arr.shift();
        const end = arr.pop();
        super({
            code: 'cyclic_model',
            message: `Cyclic import ${start}->${end}`,
            path: Array.from(options.stack)
        });
    }
}

export class ParserErrorExtendsNotFound extends ParserError {
    constructor(options: { model: string; inherit: string; path: string[] }) {
        super({
            code: 'model_extends_not_found',
            message: `Model "${options.model}" is extending "${options.inherit}", but it does not exists`,
            path: options.path
        });
    }
}

export class ParserErrorTypeSyntax extends ParserError {
    constructor(options: { value: string; path: string[] }) {
        super({
            code: 'type_syntax_error',
            message: `Type "${options.value}" contains some unsupported typescript syntax, please use allowed syntax. Documentation: https://docs.nango.dev/reference/integration-configuration#model-types`,
            path: options.path
        });
    }
}

export class ParserErrorBothPostConnectionScriptsAndOnEventsPresent extends ParserError {
    constructor(options: { path: string[] }) {
        super({
            code: 'both_post_connection_scripts_and_on_events_present',
            message: `Both post-connection-scripts and on-events are present. Only one of them can be used at a time.`,
            path: options.path
        });
    }
}
