import { stripHopByHopHeaders } from './headers'

describe('Filter connection headers', () => {
  it('removes all hop by hop headers', () => {
    const headers = {
      te: 'gzip',
      host: 'example.net',
      'content-Type': 'application/json',
      connection: 'keep-alive, foo, bar',
      foo: 'abc',
      'keep-alive': 'timeout=30'
    }

    expect(stripHopByHopHeaders(headers)).toMatchSnapshot()
  })

  it('removes http2 headers', () => {
    const headers = {
      te: 'gzip',
      host: 'example.net',
      'content-Type': 'application/json',
      connection: 'keep-alive, Foo, Bar',
      foo: 'abc',
      'keep-alive': 'timeout=30',
      ':method': 'GET',
      ':scheme': 'https'
    }

    expect(stripHopByHopHeaders(headers)).toMatchSnapshot()
  })
})
