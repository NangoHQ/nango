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
            message: `Parsed a literal type "${options.model}" maybe it's a mistake. We advice using fully fledged Model for input and output`,
            path: options.path
        });
    }
}
