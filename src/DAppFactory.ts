import {
  IDAppInstance,
  OpenChannelParams,
  SignedResponse,
  OpenChannelData,
  DAppInstanceParams,
  IRsa,
  Rsa,
  CallParams,
  IGameLogic,
  GetChannelDataParams,
  GameLogicFunction
} from "./interfaces/index"
import { PayChannelLogic } from "./PayChannelLogic"
import { ChannelState } from "./ChannelState"
import {
  sha3,
  dec2bet,
  makeSeed,
  bet2dec,
  SolidityTypeValue,
  Eth
} from "dc-ethereum-utils"
import { Logger } from "dc-logging"

import { config, ContractInfo, BlockchainNetwork, IConfig } from "dc-configs"

import { GlobalGameLogicStore } from "./GlobalGameLogicStore"
import { DApp } from "./DApp"
import { IMessagingProvider } from "dc-messaging"
import { DAppInstance } from "./DAppInstance"

export class DAppFactory {
  eth: Eth
  private _transportProvider: IMessagingProvider
  private _configuration: IConfig
  constructor(
    transportProvider: IMessagingProvider,
    configuration: IConfig = config
  ) {
    const {
      gasPrice: price,
      gasLimit: limit,
      web3HttpProviderUrl: httpProviderUrl,
      contracts,
      privateKey
    } = configuration
    this._configuration = configuration
    this._transportProvider = transportProvider
    this.eth = new Eth({
      privateKey,
      httpProviderUrl,
      ERC20ContractInfo: contracts.ERC20,
      gasParams: { price, limit }
    })
    const globalStore: any = global || window
    globalStore.DCLib = new GlobalGameLogicStore()
  }
  async create(params: {
    name: string
    gameLogicFunction: GameLogicFunction
    contract: ContractInfo
    rules: any
  }): Promise<DApp> {
    const { name, gameLogicFunction, contract, rules } = params
    const { platformId, blockchainNetwork } = this._configuration
    const dappParams = {
      slug: name,
      platformId,
      blockchainNetwork,
      contract,
      rules,
      roomProvider: this._transportProvider,
      gameLogicFunction,
      Eth: this.eth
    }
    await this.eth.initAccount()
    const dapp = new DApp(dappParams)
    return dapp
  }
  async startClient(params: {
    name: string
    gameLogicFunction: GameLogicFunction
    contract: ContractInfo
    rules: any
  }): Promise<DAppInstance> {
    const dapp = await this.create(params)
    const dappInstance = await dapp.startClient()
    return dappInstance
  }
  async startDealer(params: {
    name: string
    gameLogicFunction: GameLogicFunction
    contract: ContractInfo
    rules: any
  }) {
    const dapp = await this.create(params)
    const dappInstance = await dapp.startServer()
    return dappInstance
  }
}
