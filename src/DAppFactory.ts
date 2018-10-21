import {
  OpenChannelParams,
  SignedResponse,
  DAppInstanceParams,
  IDAppPlayerInstance,
  IDAppDealerInstance,
  IRsa,
  Rsa,
  IGameLogic,
  GetChannelDataParams
} from "./interfaces/index"

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
import { DAppPlayerInstance } from "./DAppPlayerInstance"

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
      walletName
    } = configuration
    this._configuration = configuration
    this._transportProvider = transportProvider
    this.eth = new Eth({
      walletName,
      httpProviderUrl,
      ERC20ContractInfo: contracts.ERC20,
      gasParams: { price, limit }
    })
    const globalStore: any = global || window
    globalStore.DCLib = new GlobalGameLogicStore()
  }

  async create(params: {
    name: string
    gameLogicFunction: () => IGameLogic
    contract: ContractInfo
    gameEth?: Eth
    rules: any
  }): Promise<DApp> {
    const { name, gameLogicFunction, contract, rules, gameEth } = params
    const { platformId, blockchainNetwork } = this._configuration
    const dappParams = {
      slug: name,
      platformId,
      blockchainNetwork,
      contract,
      rules,
      roomProvider: this._transportProvider,
      gameLogicFunction,
      Eth: gameEth || this.eth
    }

    return new DApp(dappParams)
  }

  async startClient(params: {
    name: string
    gameLogicFunction: () => IGameLogic
    contract: ContractInfo
    rules: any
  }): Promise<DAppPlayerInstance> {
    const dapp = await this.create(params)
    const dappInstance = await dapp.startClient()
    return dappInstance
  }

  async startDealer(params: {
    name: string
    gameLogicFunction: () => IGameLogic
    contract: ContractInfo
    rules: any
  }): Promise<void> {
    const { privateKey } = config
    await this.eth.initAccount(privateKey)
    await this.eth.saveWallet('1234', privateKey)

    const dapp = await this.create(params)
    const dappInstance = await dapp.startServer()
    return dappInstance
  }
}
