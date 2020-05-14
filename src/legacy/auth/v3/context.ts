import { TConnectContextRequest, TCallbackContextRequest } from './types'
import { NextFunction, Response } from 'express'
import { UserError } from '../../errors'
import { NoAuthInProgress } from './errors'
import { asyncMiddleware } from '../../errorHandler'

const getConnectParams = (params?: any) => {
  if (params === undefined) {
    return {}
  }

  if (typeof params !== 'object' || Array.isArray(params)) {
    throw new InvalidConnectParams()
  }

  for (const [name, value] of Object.entries(params)) {
    if (typeof value !== 'string' || !/^[\w\s.-]*$/.test(value)) {
      throw new InvalidConnectParam(name)
    }
  }

  return params
}

export const connectContext = (req: TConnectContextRequest, res: Response, next: NextFunction) => {
  const { buid, setupId } = req

  const connectParams = getConnectParams(req.query.params)

  req.session.context = {
    connectParams,
    setupId,
    buid
  }

  req.connectParams = connectParams

  next()
}

export const callbackContext = asyncMiddleware(
  async (req: TCallbackContextRequest, _res: Response, next: NextFunction) => {
    if (!req.session.context) {
      throw new NoAuthInProgress()
    }

    const { buid, connectParams } = req.session.context

    req.isCallback = true
    req.connectParams = connectParams
    req.buid = buid
    req.setupId = req.session.authConfig.setupDetails.setup_id

    next()
  }
)

class InvalidConnectParams extends UserError {
  constructor() {
    super(
      // tslint:disable:max-line-length
      `Incorrect format for connect parameters'

Connect parameters must be sent as query parameters of the form \`params[name]=value\` eg. \`params[subdomain]=my-app\`'`,
      // tslint:enable:max-line-length
      400,
      'INVALID_CONNECT_PARAMS'
    )
  }
}

class InvalidConnectParam extends UserError {
  constructor(name: string) {
    super(
      `Incorrect format for connect parameter '${name}'

Connect parameters may contain alphanumeric and space characters, or any of the following symbols '_-.'

Refer to this link for further information: https://docs.bearer.sh/faq/connect-button`,
      400,
      'INVALID_CONNECT_PARAM'
    )
  }
}
