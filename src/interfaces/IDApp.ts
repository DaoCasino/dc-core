import { IMessagingProvider } from '@daocasino/dc-messaging'
import { BlockchainUtilsInstance } from "@daocasino/dc-blockchain-types"
import { DAppInstanceView, IGameLogic } from './index'
import { EventEmitter } from 'events'
import { IDAppPlayerInstance } from './IDAppInstance'
import { IStatisticsServerConnectParams } from './IStatisticsServerConnectParams'

export interface DAppParams {
  slug: string
  rules: any
  platformId: string
  userAddress: string
  blockchainNetwork: string
  gameLogicFunction: () => IGameLogic
  gameContractAddress: string
  roomProvider: IMessagingProvider
  Eth: BlockchainUtilsInstance
  statisticsClient?: IStatisticsServerConnectParams
}

export interface IDApp extends EventEmitter {
  getView: () => {
    name: string
  }
  getInstancesView: () => DAppInstanceView[]
  startClient: () => Promise<IDAppPlayerInstance>
}
