import { describe, it, Test } from "mocha"
import { expect } from "chai"
import crypto from "crypto"
import { Rsa } from "../interfaces"

import { SolidityTypeValue, sha3, remove0x } from "dc-ethereum-utils"

const suite = describe("Rsa Tests", () => {
  it("Verify", async () => {
    const fullRsa = new Rsa()
    const ne = fullRsa.getNE()
    const n = remove0x(ne.n)
    const trueNE = {
      n: Buffer.from(ne.n, "hex"),
      e: parseInt(ne.e, 16)
    }
    const publicRsa = Rsa.importPublic(trueNE)
    const pne = publicRsa.getNE()
    const msgData: SolidityTypeValue[] = [
      { t: "bytes32", v: crypto.randomBytes(32).toString("hex") },
      { t: "uint", v: "1" },
      { t: "uint", v: "1000000000000" },
      { t: "uint", v: [1] },
      { t: "bytes32", v: crypto.randomBytes(32).toString("hex") }
    ]
    const msgHash = sha3(...msgData)
    const sign = fullRsa.sign(msgHash, "hex", "utf8")
    const verify = publicRsa.verify(msgHash, sign, "utf8", "hex")
    // tslint:disable-next-line:no-unused-expression
    expect(verify).to.be.true
  })
})
