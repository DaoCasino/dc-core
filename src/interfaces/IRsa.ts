import NodeRsa from "node-rsa"

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

export class Rsa implements IRsa {
  private _key: NodeRsa
  constructor(params?: any) {
    this._key = (params && params.key) || new NodeRsa(params || {})
  }

  static importPublic(params: { n: Buffer; e: number }): Rsa {
    const key = new NodeRsa()
    key.importKey(params, "components-public")
    return new Rsa(key)
  }

  getNE(): { n: string; e: string } {
    const { n, e } = this._key.keyPair
    const copy = {...n}
    const buf = n.toBuffer()
    n.fromBuffer(buf)
    const nStr = `0x${buf.toString("hex")}`
    const buf2 = Buffer.from(nStr, "hex")
    n.fromBuffer(buf2)
    return { n: `0x${buf.toString("hex")}`, e: `0x0${e.toString(16)}` }
  }

  /**
   *  Signing data
   *
   * @param buffer {string|number|object|array|Buffer} - data for signing. Object and array will convert to JSON string.
   * @param encoding {string} - optional. Encoding for output result, may be 'buffer', 'binary', 'hex' or 'base64'. Default 'buffer'.
   * @param source_encoding {string} - optional. Encoding for given string. Default utf8.
   * @returns {string|Buffer}
   */
  sign(
    buffer: Buffer | number | object | string,
    encoding: "buffer" | "binary" | "hex" | "base64" = "buffer",
    sourceEncoding: string = "utf8"
  ): string | Buffer {
    return this._key.sign(buffer, encoding, sourceEncoding)
  }
  /**
   * Encrypting data method with public key
   *
   * @param buffer {string|number|object|array|Buffer} - data for encrypting. Object and array will convert to JSON string.
   * @param encoding {string} - optional. Encoding for output result, may be 'buffer', 'binary', 'hex' or 'base64'. Default 'buffer'.
   * @param source_encoding {string} - optional. Encoding for given string. Default utf8.
   * @returns {string|Buffer}
   */
  encrypt(
    buffer: Buffer | number | object | string,
    encoding: "buffer" | "binary" | "hex" | "base64" = "buffer",
    sourceEncoding: string = "utf8"
  ): string | Buffer {
    return this._key.encrypt(buffer, encoding, sourceEncoding)
  }
  /**
   * Decrypting data method with private key
   *
   * @param buffer {Buffer} - buffer for decrypting
   * @param encoding - encoding for result string, can also take 'json' or 'buffer' for the automatic conversion of this type
   * @returns {Buffer|object|string}
   */
  decrypt(buffer: Buffer, encoding: string): Buffer | object | string {
    return this._key.decrypt(buffer, encoding)
  }

  /**
   * Encrypting data method with private key
   *
   * Parameters same as `encrypt` method
   */

  encryptPrivate(
    buffer: Buffer | number | object | string,
    encoding: "buffer" | "binary" | "hex" | "base64" = "buffer",
    sourceEncoding: string = "utf8"
  ): string | Buffer {
    return this._key.encryptPrivate(buffer, encoding, sourceEncoding)
  }

  /**
   * Decrypting data method with public key
   *
   * Parameters same as `decrypt` method
   */
  decryptPublic(buffer: Buffer, encoding: string): Buffer | object | string {
    return this._key.decryptPublic(buffer, encoding)
  }
  /**
   *  Verifying signed data
   *
   * @param buffer - signed data
   * @param signature
   * @param sourceEncoding {string} - optional. Encoding for given string. Default utf8.
   * @param signatureEncoding - optional. Encoding of given signature. May be 'buffer', 'binary', 'hex' or 'base64'. Default 'buffer'.
   * @returns {*}
   */
  verify(
    buffer: any,
    signature: any,
    sourceEncoding: string = "utf8",
    signatureEncoding: "buffer" | "binary" | "hex" | "base64" = "buffer"
  ): boolean {
    return this._key.verify(
      buffer,
      signature,
      sourceEncoding,
      signatureEncoding
    )
  }
}
