import { config } from "@daocasino/dc-configs"
import { Logger } from "@daocasino/dc-logging"
import { Eth, makeSeed } from "@daocasino/dc-ethereum-utils"
import { generateRandom } from "../Rnd"

const log = new Logger("generateRND:Test:")
const {
  gasPrice: price,
  gasLimit: limit,
  web3HttpProviderUrl: httpProviderUrl,
  contracts,
  walletName,
  privateKey
} = config.default

const generateRNDTEST = async (rangeStart, rangeEnd) => {
  const eth = new Eth({
    walletName,
    httpProviderUrl,
    ERC20ContractInfo: contracts.ERC20,
    gasParams: { price, limit }
  })
  eth.initAccount(privateKey)
  const seed = makeSeed()
  const hash = eth.signData([{ t: "bytes32", v: seed }])

  const rnd = generateRandom(
    [
      [rangeStart, rangeEnd],
      [rangeStart * 2, rangeEnd * 3],
      [rangeStart, rangeEnd * 5]
    ],
    hash
  )

  log.debug(rnd)
}

for (let i = 0; i < 10; i++) {
  generateRNDTEST(i, i * 2)
}
