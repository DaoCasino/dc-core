import { IMessagingProvider } from "dc-messaging"
import { Eth, ETHInstance } from "dc-ethereum-utils"
import { ContractInfo } from "dc-configs"
import { IGameLogic, DAppInstanceView } from "./index"
import { platform } from "os"
import { blockchainNetworkConfigs } from "dc-configs/lib/blockchainNetworks"

export interface DAppParams {
  slug: string
  rules: any
  platformId: string
  blockchainNetwork: string
  gameLogicFunction: () => IGameLogic
  contract: ContractInfo
  roomProvider: IMessagingProvider
  Eth: ETHInstance
}

export interface IDApp {
  getView: () => {
    name: string
  }
  getInstancesView: () => DAppInstanceView[]
}
