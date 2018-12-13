import { IGameLogic } from "./interfaces/index"

import { Eth } from "@daocasino/dc-ethereum-utils"
import { Logger } from "@daocasino/dc-logging"

import { config, BlockchainNetwork, IConfig } from "@daocasino/dc-configs"

import { GlobalGameLogicStore } from "./GlobalGameLogicStore"
import { DApp } from "./DApp"
import { IMessagingProvider } from "@daocasino/dc-messaging"
import { DAppPlayerInstance } from "./DAppPlayerInstance"

export class DAppFactory {
  eth: Eth
  private _transportProvider: IMessagingProvider
  private _configuration: IConfig
  constructor(
    transportProvider: IMessagingProvider,
    configuration: IConfig = config.default
  ) {
    this._configuration = configuration
    this._transportProvider = transportProvider

    const globalStore: any = global || window
    globalStore.DCLib = new GlobalGameLogicStore()
  }

  async create(params: {
    name: string
    gameLogicFunction: () => IGameLogic
    gameContractAddress: string
    gameEth?: Eth
    rules: any
  }): Promise<DApp> {
    const {
      gasPrice: price,
      gasLimit: limit,
      web3HttpProviderUrl: httpProviderUrl,
      contracts,
      walletName
    } = this._configuration
    this.eth = new Eth({
      walletName,
      httpProviderUrl,
      ERC20ContractInfo: contracts.ERC20,
      gasParams: { price, limit }
    })
    const { name, gameLogicFunction, gameContractAddress, rules, gameEth } = params
    const { platformId, blockchainNetwork, privateKey } = this._configuration
    await this.eth.initAccount(privateKey)
    const dappParams = {
      slug: name,
      platformId,
      blockchainNetwork,
      rules,
      roomProvider: this._transportProvider,
      gameLogicFunction,
      gameContractAddress,
      Eth: gameEth || this.eth
    }

    return new DApp(dappParams)
  }

  async startClient(params: {
    name: string
    gameLogicFunction: () => IGameLogic
    gameContractAddress: string
    rules: any
  }): Promise<DAppPlayerInstance> {
    const dapp = await this.create(params)

    const dappInstance = await dapp.startClient()
    return dappInstance
  }

  async startDealer(params: {
    name: string
    gameLogicFunction: () => IGameLogic
    gameContractAddress: string
    rules: any
  }): Promise<void> {
    const dapp = await this.create(params)
    const dappInstance = await dapp.startServer()
    return dappInstance
  }
}
