declare namespace Types {
  export interface ConnectOptions {
    authId?: string
    setupId?: string
    configId?: string
  }

  export interface ConnectSuccess {
    authId: string
  }

  export interface ConnectError extends Error {}
}

export default Types
