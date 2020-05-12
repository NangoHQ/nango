import { asyncMiddleware } from '../../errorHandler'
import { IAuthConfig, EAuthType, TConnectConfigRequest, TCallbackConfigRequest } from './types'
import { NextFunction, Response } from 'express'
import {
  getConfig
  // getSetupDetails
} from '../clients/integrations'
import { InvalidAuthType } from './errors'
import { expandAuthConfig } from '../../api-config/auth-config'

const getAuthConfig = async (req: TConnectConfigRequest) => {
  const { connectParams, buid, configuration } = req

  return {
    setupDetails: configuration,
    integrationConfig: expandAuthConfig({
      connectParams,
      authConfig: (await getConfig({
        buid: buid!
      })) as any
    })
  } as IAuthConfig
}

const copyConfig = (src: IAuthConfig, dest: IAuthConfig) => {
  dest.integrationConfig = src.integrationConfig
  dest.setupDetails = src.setupDetails
}

export const connectConfig = asyncMiddleware(async (req: TConnectConfigRequest, _res: Response, next: NextFunction) => {
  const authConfig = await getAuthConfig(req)
  const { authType } = authConfig.integrationConfig

  if (!Object.values(EAuthType).includes(authType)) {
    throw new InvalidAuthType(authType)
  }

  copyConfig(authConfig, req)
  req.session.authConfig = authConfig

  next()
})

export const callbackConfig = (req: TCallbackConfigRequest, _res: Response, next: NextFunction) => {
  copyConfig(req.session.authConfig, req)

  next()
}
