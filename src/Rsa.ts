import NodeRsa from "node-rsa"
import { IRsa } from "./interfaces/index"
import { remove0x } from "dc-ethereum-utils"

const COMPONENTS_PUBLIC_KEY = "components-public"
export class Rsa implements IRsa {
  private _instance: NodeRsa

  constructor(params: any = {}) {
    this._instance = new NodeRsa(params)
  }

  getNE(): { n: string; e: string } {
    const { n, e } = this._instance.exportKey(COMPONENTS_PUBLIC_KEY)

    return {
      n: `0x${n.toString("hex")}`,
      e: `0x0${e.toString(16)}`
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
