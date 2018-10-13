import { IMessagingProvider } from 'dc-messaging'
import { Eth } from 'dc-ethereum-utils'
import { ContractInfo } from 'dc-configs'
import { GameLogicFunction, DAppInstanceView } from './index'

export interface DAppParams {
  slug: string
  rules: any
  // timer: number;
  // checkTimeout: number;
  gameLogicFunction: GameLogicFunction
  contract: ContractInfo
  roomProvider: IMessagingProvider
  Eth: Eth
}

export interface IDApp {
  getView: () => {
    name: string;
  }
  getInstancesView: () => DAppInstanceView[]
}
