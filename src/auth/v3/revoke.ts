import { asyncMiddleware } from '../../errorHandler'
import { TRevokeRequest } from './types'
// import { revokeAuthV3 } from '../../clients/integrations'
import { Response } from 'express'
import { MissingParameter } from '../../errors'

export const revoke = asyncMiddleware(async (req: TRevokeRequest, res: Response) => {
  // const { authId } = req.params
  // const { buid } = req
  const { clientId } = req.query

  if (!clientId) {
    throw new MissingParameter('clientId')
  }

  // await revokeAuthV3({
  //   clientId,
  //   buid,
  //   authId,
  //   servicesTableName: req.stageVariables.servicesTableId
  // })

  res.status(200).end()
})
