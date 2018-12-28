import { IMessagingProvider } from "@daocasino/dc-messaging"
import { BlockchainUtilsInstance, SolidityTypeValue } from "@daocasino/dc-blockchain-types"
import Contract from "web3/eth/contract"
import { GameInfo } from "./GameInfo"

export type UserId = string

export interface DAppInstanceParams {
  userId: UserId
  num: number
  rules: any
  roomAddress: string
  gameLogicFunction: () => IGameLogic
  gameContractInstance: Contract
  gameContractAddress: string
  roomProvider: IMessagingProvider
  onFinish: (userId: UserId) => void
  gameInfo: GameInfo
  Eth: BlockchainUtilsInstance
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
  n: string
  e: string
}
export interface ConnectParams {
  playerDeposit: number
}
export interface GetChannelDataParams extends ConnectParams {
  playerAddress: string
  channelId: string
}

export interface GameData {
  // options for random numbers
  // ex.: [[0,10],[50,100]] - get 2 random numbers,
  // first from 0 to 10, and second from 50 to 100
  randomRanges: number[][]
  // Some other data from game-developer
  custom?: any
}
export interface FullGameData {
  seed: string
  randomRanges: GameData["randomRanges"]
  custom?: GameData["custom"]
}

export interface PlayParams {
  // array of user bets on current round [2,1,4]
  userBets: number[]
  gameData: GameData
}

export interface PlayResult {
  profit: number // user win in current round
  data?: any // Some other data from game-developer
}

export interface IGameLogic {
  // Basic game function
  play: (
    userBets: number[],
    gameData: GameData,
    randoms: number[]
  ) => PlayResult
}

// Channel state object
export interface State {
  data: {
    _id: string
    _playerBalance: number
    _bankrollerBalance: number
    _totalBet: number
    _session: number
  }
  hash: string // sha3 hash of SolidityTypeValue data
  signs: {}
}

interface PeerBalance {
  bankroller: number
  player: number
}
export interface ChannelStateData {
  deposits: PeerBalance
  balance: PeerBalance
  profit: PeerBalance
}

export interface IDAppPlayerInstance extends IDAppInstance {
  getParamsForOpenChannel: (connectData: ConnectParams) => Promise<{
    openChannelParams: OpenChannelParams,
    signature: string
  }>
  // find bankroller in p2p network and "connect"
  connect(connectData: ConnectParams): Promise<any>

  // send open channel TX on game contract (oneStepGame.sol)
  openChannel(
    openChannelData: OpenChannelParams,
    signature: string
  ): Promise<any>

  getChannelStateData: () => ChannelStateData

  /*
    Call game logic function on dealer side and client side
    verify randoms and channelState
   */
  play(
    params: PlayParams
  ): Promise<{
    profit: number;
    randoms: number[];
    data?: any
  }>
  
  getParamsForCloseChannel: () => Promise<{
    lastState: CloseChannelParams,
    consentSignature: string
  }>
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
    userBets: PlayParams["userBets"], // array of humanreadable format token value 1 = 1 * 10**18
    // specified data for game
    gameData: FullGameData,
    session: number, // aka nonce, every call session++ on channelState
    sign: string // ETHsign of sended data / previous args
  ): Promise<{
    playResult: PlayResult
    randoms: number[] // randoms arg applied to gamelogic function
    rndSig: string // random params for verify on client side
    state: State // bankroller signed channel state
  }>

  confirmState(state: State): boolean

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
