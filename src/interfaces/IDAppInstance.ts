import { IMessagingProvider } from "dc-messaging"
import { Eth } from "dc-ethereum-utils"
import Contract from "web3/eth/contract"
import { GameInfo } from "./GameInfo"
import { IGameLogic } from "./GameLogic"

export type UserId = string

export interface DAppInstanceParams {
  userId: UserId
  num: number
  rules: any
  payChannelContract: Contract
  payChannelContractAddress: string
  roomAddress: string
  gameLogicFunction: () => IGameLogic
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
  consentSignature: string
  bankrollerAddress: string
}

export interface CloseChannelParams {
  _id: string
  _playerBalance: number
  _bankrollerBalance: number
  _totalBet: number
  _session: number
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

export interface RndData {
  // options for random numbers
  // ex.: [[0,10],[50,100]] - get 2 random numbers, 
  // first from 0 to 10, and second from 50 to 100
  opts : number[][] , // num generate options
  hash : string     , // hash from rnd args
  sig  : string     , // RSA signed @hash
  res  : string     , // sha3 hash of @sig
}

export interface PlayParams {
  userBet: number
  gameData: number[]
  rndOpts: RndData['opts']
}

export interface IDAppInstance {
  on(event: string, func: (data: any) => void)
  start(): Promise<void> | void
}

export interface IDAppPlayerInstance extends IDAppInstance {
  connect(connectData: ConnectParams): Promise<any>
  openChannel(
    openChannelData: OpenChannelParams,
    signature: string
  ): Promise<any>
  play(data: { userBet: number; gameData: any }): Promise<number>
  closeChannel(
    closeParams: CloseChannelParams,
    paramsSignature: string
  ): Promise<any>
  disconnect()
}

export interface IDAppDealerInstance extends IDAppInstance {
  getOpenChannelData(
    data: ConnectParams,
    signature: string
  ): Promise<SignedResponse<OpenChannelParams>>
  checkOpenChannel(): Promise<any | Error>
  callPlay(
    userBet: number,
    gameData: any,
    seed: string,
    session: number,
    sign: string
  ): Promise<{
    profit: number
    randoms: number[]
    randomSignature: string | Buffer
    state: any
  }>
  consentCloseChannel(stateSignature: string): ConsentResult
  checkCloseChannel(): Promise<any | Error>
}
export interface IDAppInstanceOld {
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
    data: any
  ) => Promise<{
    signature: string
    randomHash: string
    gameLogicCallResult: any
  }>
  reconnect: (data: any) => void
  // closeTimeout(); WTF???
  disconnect: (data: any) => void
}
