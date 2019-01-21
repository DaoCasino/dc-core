import { describe, it, Test } from 'mocha'
import { expect } from 'chai'
import crypto from 'crypto'
import { Rsa } from '../Rsa'

import { sha3, remove0x } from "@daocasino/dc-ethereum-utils"
import { SolidityTypeValue } from "@daocasino/dc-blockchain-types"
import { Logger } from "@daocasino/dc-logging"

const log = new Logger('PingService test')

describe('Rsa Tests', () => {
  it('Verify', async () => {
    const fullRsa = new Rsa()
    const ne = fullRsa.getNE()

    const publicRsa = new Rsa(null)
    publicRsa.setNE(ne)

    const pne = publicRsa.getNE()
    const msgData: SolidityTypeValue[] = [
      { t: 'bytes32', v: crypto.randomBytes(32).toString('hex') },
      { t: 'uint', v: '1' },
      { t: 'uint', v: '1000000000000' },
      { t: 'uint', v: [1] },
      { t: 'bytes32', v: crypto.randomBytes(32).toString('hex') }
    ]
    const msgHash = sha3(...msgData)
    const sign = fullRsa.sign(msgHash)
    const verify = publicRsa.verify(msgHash, sign)
    // tslint:disable-next-line:no-unused-expression
    expect(verify).to.be.true
  })
})
