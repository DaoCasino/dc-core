import NodeRsa from "node-rsa"

export interface IRsa {
  getNE: () => { n: string; e: string }
  setNE: (params: { n: string; e: string }) => { n: string; e: string }

  sign: (string) => string

  verify: (msg: string, sign: string) => boolean
}
