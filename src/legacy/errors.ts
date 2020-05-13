import { TBackendRequestV4 } from '../types'

export abstract class CustomError extends Error {
  constructor(message: string) {
    super(message)

    Object.setPrototypeOf(this, new.target.prototype)
    this.name = this.constructor.name

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = new Error(message).stack
    }
  }
}

export abstract class UserError extends CustomError {
  constructor(message: string, public statusCode: number, public code: string) {
    super(message)
  }
}

export class GenericFunctionError extends UserError {
  constructor(req: TBackendRequestV4, e: Error & { requestId?: string }) {
    super(`Error while executing function`, 422, 'FUNCTION_ERROR')
  }
}

function timeOut(error: string, payload: string): boolean {
  const unhandled = error === 'Unhandled'
  const errorMessage = JSON.parse(payload).errorMessage.toString()
  const timedOut = unhandled && /Task timed out/.test(errorMessage)

  return timedOut
}

export class UnhandledFunctionError extends UserError {
  constructor({ FunctionError, Payload }: { FunctionError: string; Payload: string }) {
    if (timeOut(FunctionError, Payload)) {
      super(`Integration execution timed out`, 504, 'INTEGRATION_EXECUTION_TIMED_OUT')
    } else {
      super(`Error while processing integration: ${Payload} `, 422, 'UNHANDLED_FUNCTION')
    }
  }
}
export class MissingParameter extends UserError {
  constructor(name: string) {
    super(`'${name}' must be set`, 400, 'MISSING_PARAMETER')
  }
}

export class InvalidBuid extends UserError {
  constructor(buid: string) {
    super(
      // tslint:disable-next-line:max-line-length
      `No API found with alias/buid '${buid}', please refer to this link for further information: https://docs.bearer.sh/dashboard/apis#how-to-add-a-new-api`,
      422,
      'INVALID_BUID'
    )
  }
}

export class FunctionNotFound extends UserError {
  constructor(functionName: string) {
    super(`Could not find function '${functionName}'. Perhaps url is incorrect?`, 404, 'FUNCTION_NOT_FOUND')
  }
}

export class SetupDetailsNotFound extends UserError {
  constructor({ clientId, buid, setupId }: { clientId: string; buid: string; setupId: string }) {
    super(
      `Setup details not found for clientId '${clientId}', buid '${buid}' and setupId '${setupId}'`,
      422,
      'SETUP_DETAILS_NOT_FOUND'
    )
  }
}

export class RateLimitReached extends UserError {
  constructor() {
    super(
      `Your request couldn't be performed because you have reached Bearer's rate limit.
More information on our rate limiting here: https://docs.bearer.sh/rate-limiting`,
      429,
      'API_RATE_LIMIT_REACHED'
    )
  }
}

export class UnauthorizedAgentConfigAccess extends UserError {
  constructor() {
    super('Unauthorized invalid secret key', 401, 'UNAUTHORIZED_AGENT_CONFIG_ACCESS')
  }
}
