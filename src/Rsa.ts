import NodeRsa from "node-rsa"
import { IRsa } from "./interfaces/index"
import { add0x, remove0x } from "dc-ethereum-utils"

const COMPONENTS_PUBLIC_KEY = "components-public"
export class Rsa implements IRsa {
  private _instance: NodeRsa

  constructor(params: any = {}) {
    this._instance = new NodeRsa(params)
  }

  getNE(): { n: string; e: string } {
    const { n, e } = this._instance.exportKey(COMPONENTS_PUBLIC_KEY)
    const _n = (n.toString("hex").length % 2 === 0) ? n.toString("hex") : '0' + n.toString("hex")
    const _e = (e.toString(16).length % 2 === 0) ? e.toString(16) : '0' + e.toString(16)
    return {
      n: `${add0x(_n)}`,
      e: `${add0x(_e)}`
    }
  }

  setNE({ n, e }: { n: string; e: string }) {
    return this._instance.importKey(
      { n: Buffer.from(remove0x(n), "hex"), e: parseInt(e, 16) },
      COMPONENTS_PUBLIC_KEY
    )
  }

  sign(msg: string): string {
    return this._instance
      .encryptPrivate(Buffer.from(msg, "utf8"))
      .toString("hex")
  }

  verify(msg: string, sign: string): boolean {
    const decryptedMsg = this._instance
      .decryptPublic(Buffer.from(sign, "hex"))
      .toString("utf8")

    return msg === decryptedMsg
  }
}
