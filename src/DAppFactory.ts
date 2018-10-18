import {
  OpenChannelParams,
  SignedResponse,
  DAppInstanceParams,
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

import { config, ContractInfo } from "dc-configs"

import { GlobalGameLogicStore } from "./GlobalGameLogicStore"
import { DApp } from "./DApp"
import { IMessagingProvider } from "dc-messaging"


export class DAppFactory {
  private _eth: Eth
  private _transportProvider: IMessagingProvider
  constructor(transportProvider: IMessagingProvider) {
    const {
      platformId,
      gasPrice: price,
      gasLimit: limit,
      web3HttpProviderUrl: httpProviderUrl,
      contracts,
      privateKey,
      blockchainNetwork
    } = config
    this._transportProvider = transportProvider
    this._eth = new Eth({
      privateKey,
      httpProviderUrl,
      ERC20ContractInfo: contracts.ERC20,
      gasParams: { price, limit }
    })
    const _global: any = global
    _global.DCLib = new GlobalGameLogicStore()
  }
  async create(params: {
    name: string
    gameLogicFunction: ()=>IGameLogic
    contract: ContractInfo
    rules: any
  }): Promise<DApp> {
    const { name, gameLogicFunction, contract, rules } = params
    const { platformId, blockchainNetwork } = config
    const dappParams = {
      slug: name,
      platformId,
      blockchainNetwork,
      contract,
      rules,
      roomProvider: this._transportProvider,
      gameLogicFunction,
      Eth: this._eth
    }
    await this._eth.initAccount()
    const dapp = new DApp(dappParams)
    return dapp
  }
  
  async startClient(params: {
    name: string
    gameLogicFunction: ()=>IGameLogic
    contract: ContractInfo
    rules: any
  // }): Promise<DAppInstance> {
  }) {
    // const dapp = await this.create(params)
    // const dappInstance = await dapp.startClient()
    // return dappInstance
  }

  async startDealer(params: {
    name: string
    gameLogicFunction: ()=>IGameLogic
    contract: ContractInfo
    rules: any
  }) {
    const dapp = await this.create(params)
    const dappInstance = await dapp.startServer()
    return dappInstance
  }
}
