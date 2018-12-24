import { IMessagingProvider } from "@daocasino/dc-messaging"
import { ETHInstance } from "@daocasino/dc-ethereum-utils"
import { IGameLogic, DAppInstanceView } from "./index"
import { EventEmitter } from "events"
import { IDAppPlayerInstance } from "./IDAppInstance"

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

export interface IDApp extends EventEmitter {
  getView: () => {
    name: string
  }
  getInstancesView: () => DAppInstanceView[]
  startClient: () => Promise<IDAppPlayerInstance>
}
