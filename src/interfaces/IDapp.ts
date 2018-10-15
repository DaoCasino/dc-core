import { IMessagingProvider } from "dc-messaging"
import { Eth } from "dc-ethereum-utils"
import { ContractInfo } from "dc-configs"
import { GameLogicFunction, DAppInstanceView } from "./index"
import { platform } from "os"

export interface DAppParams {
  slug: string
  rules: any
  platformId: string
  gameLogicFunction: GameLogicFunction
  contract: ContractInfo
  roomProvider: IMessagingProvider
  Eth: Eth
}

export interface IDApp {
  getView: () => {
    name: string
  }
  getInstancesView: () => DAppInstanceView[]
}
