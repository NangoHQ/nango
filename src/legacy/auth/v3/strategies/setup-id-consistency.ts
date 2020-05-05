import { InconsistentSetupId } from '../errors'

export const checkSetupIdConsistency = ({ setupId, setupIdParam, setupIdFromRequest }: CheckConsistencyParams) => {
  if (setupIdParam && setupIdParam !== setupId) {
    if (setupIdFromRequest) {
      throw new InconsistentSetupId()
    }
  }
}

interface CheckConsistencyParams {
  setupId: string
  setupIdParam?: string
  setupIdFromRequest?: boolean
}
