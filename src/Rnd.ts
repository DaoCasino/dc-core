import BigInteger from "node-rsa/src/libs/jsbn"
import { Logger } from "dc-logging"
import {add0x, remove0x, sha3} from "dc-ethereum-utils"

const logger = new Logger('RND:')
// generateRnd: (ranges: number[][], signature: string) => number[]

export const generateRandom = (ranges: number[][], signature: any): number[] => {
  const randomNumsArray = ranges.map((range, index) => {
    return range.reduce((min, max) => {
      const rangeCalc = max - min + 1
      const rangeInHex = rangeCalc.toString(16)
      const _signature = add0x(signature.toString("hex"))

      let randomInHex = sha3(
        { t: "bytes", v: _signature },
        { t: "uint", v: index }
      )
      let randomInBN = new BigInteger(remove0x(randomInHex), 16)

      const randomForCheck = (2 ** (256 - 1) / rangeCalc) * rangeCalc
      const randomForCheckInBN = new BigInteger(
        randomForCheck.toString(16),
        16
      )

      while (randomInBN.compareTo(randomForCheckInBN) > 0) {
        randomInHex = sha3({ t: "bytes32", v: randomInHex })
        randomInBN = new BigInteger(remove0x(randomInHex), 16)
      }

      const rangeInBN = new BigInteger(rangeInHex, 16)
      const minNumberToHex = min.toString(16)
      const minNumberToBN = new BigInteger(minNumberToHex, 16)

      const calcRandom = randomInBN.remainder(rangeInBN).add(minNumberToBN)
      const randomToInt = parseInt(add0x(calcRandom.toString(16)), 16)
      logger.debug(`local random number: ${randomToInt}`)

      return randomToInt
    })
  })

  return randomNumsArray
}