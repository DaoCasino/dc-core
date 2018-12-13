import { IMessagingProvider } from "@daocasino/dc-messaging"
import { ETHInstance } from "@daocasino/dc-ethereum-utils"
import { IGameLogic, DAppInstanceView } from "./index"

export interface DAppParams {
  slug: string
  rules: any
  platformId: string
  blockchainNetwork: string
  gameLogicFunction: () => IGameLogic
  gameContractAddress: string
  roomProvider: IMessagingProvider
  Eth: ETHInstance
}

export interface IDApp {
  getView: () => {
    name: string
  }
  getInstancesView: () => DAppInstanceView[]
}
