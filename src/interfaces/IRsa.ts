
export interface IRsa {
  getNE: () => { n: string; e: string }
  encrypt: (
    buffer: Buffer | number | object | string,
    encoding?: "buffer" | "binary" | "hex" | "base64",
    sourceEncoding?: string
  ) => string | Buffer
  decrypt: (buffer: Buffer, encoding?: string) => Buffer | object | string
  encryptPrivate: (
    buffer: Buffer | number | object | string,
    encoding?: "buffer" | "binary" | "hex" | "base64",
    sourceEncoding?: string
  ) => string | Buffer
  decryptPublic: (buffer: Buffer, encoding?: string) => Buffer | object | string
  verify: (
    buffer: any,
    signature: any,
    sourceEncoding?: string,
    signatureEncoding?: "buffer" | "binary" | "hex" | "base64"
  ) => boolean
  sign: (
    buffer: Buffer | number | object | string,
    encoding?: "buffer" | "binary" | "hex" | "base64",
    sourceEncoding?: string
  ) => string | Buffer
}

