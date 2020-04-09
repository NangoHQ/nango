import { getIdTokenJwt, responseToCredentials } from './common'

// This is a JWT with payload { realmid: '1234567890' }
const jwtToken =
  // tslint:disable-next-line:max-line-length
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWFsbWlkIjoiMTIzNDU2Nzg5MCJ9.OrV46u_PzFC0LFYPUaN5xnrxZdAJucZqvKGh_ncTZKM'

const jwtPayload = { realmid: '1234567890' }

describe('responseToCredentials', () => {
  const minimalResponse = { accessToken: 'test-access-token', decodedResponse: { body: {}, headers: {} } }

  const fullResponse = {
    ...minimalResponse,
    idToken: 'test-id-token',
    refreshToken: 'test-refresh-token',
    expiresIn: 1234
  }

  describe('when all values are in the response', () => {
    it('returns the response details', () => {
      expect(responseToCredentials(fullResponse)).toEqual({
        accessToken: 'test-access-token',
        idToken: 'test-id-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 1234
      })
    })
  })

  describe('when optional values are missing from the response', () => {
    it('returns defaults for those values', () => {
      expect(responseToCredentials(minimalResponse)).toEqual({
        accessToken: 'test-access-token',
        idToken: 'non',
        refreshToken: 'non',
        expiresIn: 0
      })
    })
  })

  describe('when the Id Token is a JWT', () => {
    it('includes the token payload', () => {
      expect(responseToCredentials({ ...minimalResponse, idToken: jwtToken }).idTokenJwt).toEqual(jwtPayload)
    })
  })
})

describe('getIdTokenJwt', () => {
  describe('when there is no Id Token', () => {
    it('is undefined', () => {
      expect(getIdTokenJwt(undefined)).toBeUndefined()
    })
  })

  describe('when the Id Token is not a JWT', () => {
    it('is undefined', () => {
      expect(getIdTokenJwt('not-a-jwt')).toBeUndefined()
    })
  })

  describe('when the Id Token is a JWT', () => {
    it('returns the JWT payload', () => {
      expect(getIdTokenJwt(jwtToken)).toEqual(jwtPayload)
    })
  })
})
