// @ts-ignore
import { getConfig, getSetupDetails, updateAuthV3, revokeAuthV3, getAuth, saveSetupDetails } from './integrations'

describe('integration client', () => {
  // const servicesTableName = 'test-services-table'
  // const setupId = 'a-setup-id'
  // const clientId = 'test-client-id'
  // const authId = 'test-auth-id'
  const buid = 'test-buid'

  describe('getConfig', () => {
    const config = { test: 'config' }

    it('retrieves the config from DynamoDb', async () => {
      const result = await getConfig({ buid })

      expect(result).toBe(config)
    })

    it("raises an InvalidBuid error if the config doesn't exist", async () => {
      expect(getConfig({ buid })).rejects.toMatchSnapshot()
    })

    it('uppercases the authType', async () => {
      // const result = await getConfig({ buid })
      // expect(result.config.authType).toBe('OAUTH1')
    })
  })

  // describe('getSetupDetails', () => {
  //   const details = { test: 'details' }
  //   const data = { data: 'value' }
  //   // const detailsWithData = { data, ...details }
  //   const scopedUserDataTableName = 'test-scoped-data-table'

  //   it('retrieves the config from DynamoDb', async () => {
  //     const result = await getSetupDetails({ clientId, buid, setupId, scopedUserDataTableName })

  //     expect(result).toBe(details)
  //   })

  //   it('returns the `data` attribute when one exists, rather than the whole item', async () => {
  //     const result = await getSetupDetails({ clientId, buid, setupId, scopedUserDataTableName })

  //     expect(result).toBe(data)
  //   })

  //   it("raises a SetupDetailsNotFound error if the config doesn't exist", async () => {
  //     expect(getSetupDetails({ clientId, buid, setupId, scopedUserDataTableName })).rejects.toMatchSnapshot()
  //   })
  // })
})
