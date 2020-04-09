const AWS = jest.genMockFromModule('aws-sdk')

const cloudFormationInstance = {
  describeStackResources: () => {}
}

const lambdaInstance = {
  invoke() {},
  config: { region: 'eu-west-3' }
}

AWS.Lambda = function() {
  return lambdaInstance
}

const promiseResponse = {
  promise: () => Promise.resolve({})
}

const mockDbClient = {
  get: jest.fn(() => promiseResponse),
  put: jest.fn(() => promiseResponse),
  update: jest.fn(() => promiseResponse),
  delete: jest.fn(() => promiseResponse)
}

AWS.DynamoDB = {
  DocumentClient: jest.fn(() => {
    return mockDbClient
  })
}

const mockedFirehoseInstance = {
  putRecord: jest.fn(() => ({ promise: () => Promise.resolve() })),
  putRecordBatch: jest.fn(() => ({ promise: () => Promise.resolve() }))
}

const mockedCloudWatchLogsInstance = {
  createLogStream: jest.fn(() => ({ promise: () => Promise.resolve() })),
  putLogEvents: jest.fn(() => ({ promise: () => Promise.resolve() }))
}

const cloudWatchLogs = jest.fn(() => mockedCloudWatchLogsInstance)
const firehose = jest.fn(() => mockedFirehoseInstance)

AWS.CloudWatchLogs = cloudWatchLogs
AWS.Firehose = firehose

module.exports = AWS
module.exports.mockDbClient = mockDbClient
