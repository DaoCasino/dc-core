import { IMessagingProvider } from 'dc-messaging'
import { Eth } from 'dc-ethereum-utils'
import Contract from 'web3/eth/contract'
import { GameInfo } from './GameInfo'
import { GameLogicFunction } from './index'

export type UserId = string

export interface DAppInstanceParams {
  userId: UserId
  num: number
  rules: any
  payChannelContract: Contract
  payChannelContractAddress: string
  roomAddress: string
  gameLogicFunction: GameLogicFunction
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
  channelId: any // TODO add type
  playerAddress: string
  bankrollerAddress: string
  playerDepositWei: string
  bankrollerDepositWei: string
  openingBlock: string
  gameData: string
  n: string
  e: string
}
export interface CallParams {
  userBet: number
  gameData: number[]
  seed: string
  nonce: number
  sign: string
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
  // call(data: CallParams): Promise<{
  //   signature: string;
  //   randomHash: string;
  //   callResult: any;
  // } | Error>
  connect(connectData: ConnectParams): Promise<any | Error>
  disconnect()
  openChannel(
    openChannelData: OpenChannelParams,
    signature: string
  ): Promise<any | Error>
  closeChannel(
    closeParams: CloseChannelParams,
    paramsSignature: string
  ): Promise<any | Error>
}

export interface IDAppDealerInstance {
  on(event: string, func: (data: any) => void)
  startServer(): any
  // call(data: CallParams): Promise<{
  //   callResult: any,
  //   randomSignature: string
  // } | Error>
  getOpenChannelData(
    data: ConnectParams,
    signature: string
  ): Promise<SignedResponse<OpenChannelParams>>
  checkOpenChannel(): Promise<any | Error>
  consentCloseChannel(stateSignature: string): ConsentResult
  checkCloseChannel(): Promise<any | Error>
}

export interface IDAppInstance {
  on(event: string, func: (data: any) => void)
  getOpenChannelData: (
    data: ConnectParams,
    signature: string
  ) => Promise<SignedResponse<OpenChannelParams>>
  checkOpenChannel: () => Promise<any>
  updateState: (data: { state: any }) => { status: string }
  closeChannel(): Promise<any>
  consentCloseChannel(signLastState: string): any
  // closeByConsent: (data: any) => { sign: string };
  checkCloseChannel: (data: any) => void
  call: (
    data: CallParams
  ) => Promise<{
    signature: string;
    randomHash: string;
    gameLogicCallResult: any;
  }>
  reconnect: (data: any) => void
  // closeTimeout(); WTF???
  disconnect: (data: any) => void
}
