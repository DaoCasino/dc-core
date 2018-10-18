import { IMessagingProvider } from 'dc-messaging'
import { Eth } from 'dc-ethereum-utils'
import Contract from 'web3/eth/contract'
import { GameInfo } from './GameInfo'
import { IGameLogic } from './GameLogic'

export type UserId = string

export interface DAppInstanceParams {
  userId: UserId
  num: number
  rules: any
  payChannelContract: Contract
  payChannelContractAddress: string
  roomAddress: string
  gameLogicFunction: ()=>IGameLogic
  roomProvider: IMessagingProvider
  onFinish: (userId: UserId) => void
  gameInfo: GameInfo
  Eth: Eth
}

export interface ConnectParams {
  playerDeposit: number
  gameData: any
}
export interface GetChannelDataParams extends ConnectParams {
  playerAddress: string
  channelId: string
}

export interface OpenChannelParams {
  channelId: string
  playerAddress: string
  bankrollerAddress: string
  playerDepositWei: string
  bankrollerDepositWei: string
  openingBlock: string
  gameData: string
  n: string
  e: string
}



export interface ConsentResult {
  consentSignature: string,
  bankrollerAddress: string
}

export interface CloseChannelParams {
  _id: string,
  _playerBalance: number,
  _bankrollerBalance: number,
  _totalBet: number,
  _session: number,
  _consent: boolean
}

export interface SignedResponse<TResponse> {
  response: TResponse
  signature: string
}

export interface DAppInstanceView {
  deposit: number
  playerBalance: number
  bankrollerBalance: number
  profit: number
  playerAddress: string
}


export interface IDAppPlayerInstance {
  on(event: string, func: (data: any) => void)
  startClient(): Promise<any | Error>
  connect(connectData: ConnectParams): Promise<any | Error>
  openChannel(
    openChannelData: OpenChannelParams,
    signature: string
  ): Promise<any | Error>
  play(data:{userBet: number, gameData: any} ): Promise<number>
  closeChannel(
    closeParams: CloseChannelParams,
    paramsSignature: string
  ): Promise<any | Error>
  disconnect()
}


export interface IDAppDealerInstance {
  on(event: string, func: (data: any) => void)
  startServer(): any
  getOpenChannelData(
    data: ConnectParams,
    signature: string
  ): Promise<SignedResponse<OpenChannelParams>>
  checkOpenChannel(): Promise<any | Error>
  callPlay(userBet:number, gameData:any, seed:string, session:number, sign:string): Promise<{
    profit: number,
    randoms: number[],
    randomHash: string,
    randomSignature: string,
    state: any
  }>
  consentCloseChannel(stateSignature: string): ConsentResult
  checkCloseChannel(): Promise<any | Error>
}

