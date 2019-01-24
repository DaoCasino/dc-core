import BN from "bn.js"
import { Logger } from "@daocasino/dc-logging"
import {add0x, remove0x, sha3} from "@daocasino/dc-ethereum-utils"

const logger = new Logger('RND:')


export const generateRandom = (ranges: number[][], signature: any): number[] => {
  const randomNumsArray = ranges.map((range, index) => {
    const maxNumber   = range[1]
    const minNumber   = range[0]
    const minNumberBN = new BN(minNumber.toString(16), 16)
    const delta       = maxNumber - minNumber + 1
    const deltaBN     = new BN(delta.toString(16), 16)
    const border      = (2 ** (256 - 1) / delta) * delta
    const borderBN    = new BN(border.toString(16), 16)

    let randomhex = sha3(
      { t: "bytes",   v: add0x(signature) },
      { t: "uint256", v: index }
    )
    let randomBN = new BN(remove0x(randomhex), 16)

    while (randomBN.cmp(borderBN) >= 0) {
      randomhex = sha3({ t: "bytes32", v: randomhex })
      randomBN = new BN(remove0x(randomhex), 16)
    }

    const calcRandom  = randomBN.mod(deltaBN).add(minNumberBN)
    const randomUint = parseInt(add0x(calcRandom.toString(16)), 16)

    logger.debug(`Random number${index} in range ${minNumber}-${maxNumber} = ${randomUint}`)

    return randomUint
  })

  return randomNumsArray
}