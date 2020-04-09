import uuidv4 from 'uuid/v4'
import { MiddlewareTestHarness } from '../../tests/utils'
import { setupRetrieve, setupSave } from './setup-details'
import { TBackendRequestV4 } from '../types'
// import { getSetupDetails, saveSetupDetails } from '../clients/integrations'
import { SetupDetailsNotFound } from '../errors'

jest.mock('../clients/integrations')
jest.mock('uuid/v4')

// const setupDetails = { username: 'test-user' }
const clientId = 'test-client-id'
const buid = 'test-buid'
const setupId = 'test-setup-id'
const queryString = `?referenceId=${setupId}`

const noDetailsError = new SetupDetailsNotFound({ clientId, buid, setupId })

beforeEach(() => {
  // @ts-ignore
  // getSetupDetails.mockClear()
  // @ts-ignore
  // saveSetupDetails.mockClear()
})

describe('setupSave', () => {
  const generatedSetupId = 'test-generated-id'
  const invalidAuthTypeBody = { setup: { type: 'unknown' } }
  const body = { setup: { type: 'basic', username: 'test-user' } }

  beforeEach(() => {
    // @ts-ignore
    uuidv4.mockReturnValue(generatedSetupId)
  })

  const setup = (authType = 'BASIC') =>
    new MiddlewareTestHarness<TBackendRequestV4>({
      testMiddleware: setupSave,
      configureRequest: req => {
        req.clientId = clientId
        req.buid = buid
        req.integration = {
          config: () => Promise.resolve({ authType })
        }
      }
    })

  describe('when no setup parameter is given', () => {
    it('returns a MISSING_SETUP error', async () => {
      const test = setup()

      await test.get().expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when the auth type is unknown', () => {
    it('returns a validation error', async () => {
      const test = setup()

      await test
        .get()
        .send(invalidAuthTypeBody)
        .expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when the auth type does NOT match the integration config', () => {
    it('returns an error', async () => {
      const test = setup('OAUTH2')

      await test
        .get()
        .send(body)
        .expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when the setup details already exist', () => {
    it('returns an EXISTING_SETUP error', async () => {
      const test = setup()

      await test
        .get()
        .send(body)
        .expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when the setup details do NOT already exist', () => {
    beforeEach(() => {
      // @ts-ignore
      getSetupDetails.mockRejectedValueOnce(noDetailsError)
    })

    it('saves the setup details', async () => {
      const test = setup()

      await test
        .get()
        .send(body)
        .expect(200)

      // expect(getSetupDetails).toMatchSnapshot()
      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when a referenceId is provided', () => {
    beforeEach(() => {
      // @ts-ignore
      getSetupDetails.mockRejectedValueOnce(noDetailsError)
    })

    it('uses the provided id', async () => {
      const test = setup()

      await test
        .get(queryString)
        .send(body)
        .expect(200)

      // expect(getSetupDetails).toMatchSnapshot()
      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('validation', () => {
    describe.each([
      [
        'OAUTH2',
        [
          { clientID: 'aClientId', clientSecret: 'aSecret', type: 'OAUTH2' },
          { clientID: 'aClientId', clientSecret: 'aSecret', type: 'OaUtH2' },
          { clientID: '', clientSecret: '', type: 'OAUTH2' }
        ],
        [
          { type: 'OAUTH2' },
          { clientId: 'aClientId', clientSecret: 'a secret', type: 'OAUTH2' },
          { clientID: 'a clientId', clientSecre: 'a secret', type: 'OAUTH2' },
          { clientID: 1, clientSecret: 4, type: 'OAUTH2' }
        ]
      ],
      [
        'APIKEY',
        [{ apiKey: 'anap asd asd qw3489012737ASDASDASDikey', type: 'APIKEY' }, { apiKey: '', type: 'APIKEY' }],
        [{ type: 'APIKEY' }, { apikey: 'anapikey', type: 'APIKEY' }]
      ],
      [
        'BASIC',
        [
          { username: '12737(*^&$@!)(*&#^(%!ikey 47986 key', password: 'asdasd', type: 'BASIC' },
          { username: '', password: '', type: 'BASIC' },
          { username: 'onlyMe', type: 'BASIC' }
        ],
        [{ type: 'BASIC' }, { Ysername: 'anapikey', passwordd: 'asdasd', type: 'BASIC' }]
      ],
      [
        'OAUTH1',
        [
          { consumerKey: 'asdasd', consumerSecret: 'asdasd=09823bas!d9123', type: 'OAUTH1' },
          { consumerKey: '', consumerSecret: '', type: 'OAUTH1' }
        ],
        [{ type: 'OAUTH1' }, { ConsumerKey: 'qwerty', consumer_secret: '1234testing=12', type: 'OAUTH1' }]
      ]
    ])('for auth type %s', (type: string, successes: any[], failures: any[]) => {
      describe.each(failures)('with input %j', failure => {
        it('fails', async () => {
          const test = setup(type)

          await test
            .get()
            .send({ setup: failure })
            .expect(200)

          expect(test.req.bearerResponse).toMatchSnapshot()
        })
      })

      describe.each(successes)('with input %j', success => {
        it('succeeds', async () => {
          const test = setup(type)

          await test
            .get()
            .send({ setup: success })
            .expect(200)

          expect(test.req.bearerResponse).toMatchSnapshot()
        })
      })
    })
  })

  describe('when empty strings are provided', () => {
    it('saves Basic auth setup details', async () => {
      const body = { setup: { type: 'BASIC', username: '', password: '' } }

      const test = setup()

      await test
        .get(queryString)
        .send(body)
        .expect(200)

      // expect(getSetupDetails).toMatchSnapshot()
      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })
})

describe('setupRetrieve', () => {
  const setup = () =>
    new MiddlewareTestHarness<TBackendRequestV4>({
      testMiddleware: setupRetrieve
    })

  describe('when no referenceId is given', () => {
    it('returns a MISSING_PARAMETER error', async () => {
      const test = setup()

      await test.get().expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when the setup details exist', () => {
    it('returns a response with data true', async () => {
      const test = setup()

      await test.get(queryString).expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })

  describe('when the setup details do NOT exist', () => {
    it('returns a response with data false', async () => {
      const test = setup()

      await test.get(queryString).expect(200)

      expect(test.req.bearerResponse).toMatchSnapshot()
    })
  })
})
