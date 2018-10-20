import { IMessagingProvider } from "dc-messaging"
import { Eth } from "dc-ethereum-utils"
import Contract from "web3/eth/contract"
import { GameInfo } from "./GameInfo"
import { IGameLogic } from "./GameLogic"
import { Rnd } from "./Rnd"

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

export interface DAppInstanceView {
  deposit: number
  playerBalance: number
  bankrollerBalance: number
  profit: number
  playerAddress: string
}
export interface IDAppInstance {
  on(event: string, func: (data: any) => void)
  start(): Promise<void> | void
}

/*
 * Client 
 */
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
export interface ConnectParams {
  playerDeposit: number
  gameData: any
}
export interface GetChannelDataParams extends ConnectParams {
  playerAddress: string
  channelId: string
}

export interface PlayParams {
  userBet: number
  gameData: any
  rndOpts: Rnd["opts"]
}

export interface IDAppPlayerInstance extends IDAppInstance {
  // find bankroller in p2p network and "connect"
  connect(connectData: ConnectParams): Promise<any>
  // send open channel TX on game contract (oneStepGame.sol)
  openChannel(
    openChannelData: OpenChannelParams,
    signature: string
  ): Promise<any>

  /*
    Call game logic function on dealer side and client side
    verify randoms and channelState
    rndOpts - see callPlay returns params
   */

  play(params: PlayParams): Promise<number>

  // Send close channel TX on game contract (oneStepGame.sol)
  // ask dealer to sign data for close by consent and send TX
  closeChannel(
    closeParams: CloseChannelParams,
    paramsSignature: string
  ): Promise<any>

  disconnect()
}

export interface CloseChannelParams {
  _id: string
  _playerBalance: number
  _bankrollerBalance: number
  _totalBet: number
  _session: number
}

/*
 * Dealer / bankroller 
 */
export interface IDAppDealerInstance extends IDAppInstance {
  getOpenChannelData(
    data: ConnectParams,
    signature: string
  ): Promise<SignedResponse<OpenChannelParams>>

  checkOpenChannel(): Promise<any | Error>

  /*
    Call game logic function on dealer side
   */
  callPlay(
    userBet: number, // humanreadable format token value 1 = 1 * 10**18
    gameData: any, // specified data for game
    rndOpts: Rnd["opts"], // options for generate numbers
    seed: string, // some entropy from client / random hex hash
    session: number, // aka nonce, every call session++ on channelState
    sign: string // ETHsign of sended data / previous args
  ): Promise<{
    profit: number // result of call game function
    randoms: number[] // randoms arg applied to gamelogic function
    state: any // bankroller signed channel state
    rnd: Rnd // random params for verify on client side
  }>

  consentCloseChannel(stateSignature: string): ConsentResult

  checkCloseChannel(): Promise<any | Error>
}

export interface ConsentResult {
  consentSignature: string
  bankrollerAddress: string
}

export interface SignedResponse<TResponse> {
  response: TResponse
  signature: string
}
