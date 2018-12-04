import {
  IRsa,
  GameData, State,
  IGameLogic,
  ConnectParams,
  ConsentResult,
  SignedResponse,
  OpenChannelParams,
  IDAppPlayerInstance,
  DAppInstanceParams,
  IDAppDealerInstance,
  GetChannelDataParams
} from "./index"

import {
  sha3, makeSeed,
  dec2bet, bets2decs, bet2dec, betsSumm, remove0x, flatternArr,
  SolidityTypeValue
} from "dc-ethereum-utils"

import { Logger } from "dc-logging"
import { config } from "dc-configs"
import { ChannelState } from "./ChannelState"
import { EventEmitter } from "events"
import { Rsa } from "./Rsa"
import { generateRandom } from "./Rnd"
const log = new Logger("DealerInstance")

export class DAppDealerInstance extends EventEmitter
  implements IDAppDealerInstance {
  private _peer: IDAppPlayerInstance
  private _dealer: IDAppDealerInstance
  private _config: any
  private _params: DAppInstanceParams
  private _gameLogic: IGameLogic

  Rsa: IRsa
  channel: any
  channelId: string
  channelState: ChannelState
  playerAddress: string
  playerDepositWei: string
  bankrollerDeposit: number
  bankrollerDepositWei: string

  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this._config = config.default
    this._gameLogic = this._params.gameLogicFunction()

    this.Rsa = new Rsa()
    log.debug("Dealer instance init")
  }

  eventNames() {
    return ["info"]
  }

  onPeerEvent(event: string, func: (data: any) => void) {
    this._peer.on(event, func)
  }

  start() {
    return this._params.roomProvider.exposeSevice(
      this._params.roomAddress,
      this,
      true
    )
  }
  /**
   * Create structure for recover
   * and recover openkey with structure and signature
   * if recover open key not equal player address
   * throw error
   */
  async getOpenChannelData(
    params: GetChannelDataParams,
    paramsSignature: string
  ): Promise<SignedResponse<OpenChannelParams>> {
    /** Parse params */
    const { channelId, playerAddress, playerDeposit } = params

    const toRecover: SolidityTypeValue[] = [
      { t: "bytes32", v: channelId },
      { t: "address", v: playerAddress },
      { t: "uint256", v: "" + playerDeposit },
    ]

    //  check balance
    const balances = await this._params.Eth.getBalances()
    if (balances.bet.balance < playerDeposit) {
      throw new Error(
        `Not enough bet balance at address: ${
          this._params.Eth.getAccount().address
        }`
      )
    }
    if (balances.eth.balance < 0.01) {
      throw new Error(
        `Not enough ETH balance at address: ${
          this._params.Eth.getAccount().address
        }`
      )
    }
    const recoverOpenkey = this._params.Eth.recover(
      sha3(...toRecover),
      paramsSignature
    )
    if (recoverOpenkey.toLowerCase() !== playerAddress.toLowerCase()) {
      throw new Error("Invalid signature")
    }

    this.channelId = channelId
    this.playerAddress = playerAddress

    const bankrollerAddress = this._params.Eth.getAccount().address
    const bankrollerDeposit = playerDeposit * this._params.rules.depositX
    this.bankrollerDeposit = bankrollerDeposit

    try {
      const openingBlock = await this._params.Eth.getBlockNumber()
      // Args for open channel transaction
      const { n, e } = this.Rsa.getNE()
      log.debug("" + playerDeposit)
      const playerDepositWei = ''+bet2dec(playerDeposit)
      const bankrollerDepositWei = ''+bet2dec(bankrollerDeposit)
      this.playerDepositWei = playerDepositWei
      this.bankrollerDepositWei = bankrollerDepositWei

      const response = {
        channelId,
        playerAddress,
        playerDepositWei,
        bankrollerAddress,
        bankrollerDepositWei,
        openingBlock,
        n,
        e
      }

      // Args for open channel transaction
      const toSign: SolidityTypeValue[] = [
        { t: "bytes32", v: channelId },
        { t: "address", v: playerAddress },
        { t: "address", v: bankrollerAddress },
        { t: "uint256", v: playerDepositWei },
        { t: "uint256", v: bankrollerDepositWei },
        { t: "uint256", v: openingBlock },
        { t: "bytes", v: n },
        { t: "bytes", v: e }
      ]

      /** Sign args for open channel */
      const signature = this._params.Eth.signData(toSign)
      return { response, signature }
    } catch (error) {
      throw error
    }
  }

  async checkOpenChannel(): Promise<any> {
    const bankrollerAddress = this._params.Eth.getAccount().address.toLowerCase()
    const channel = await this._params.gameContractInstance.methods
      .channels(this.channelId)
      .call()

    if (
      channel.state === "1" &&
      channel.player.toLowerCase() === this._params.userId.toLowerCase() &&
      channel.bankroller.toLowerCase() ===
        this._params.Eth.getAccount().address.toLowerCase() &&
      "" + channel.playerBalance === "" + this.playerDepositWei &&
      "" + channel.bankrollerBalance === "" + this.bankrollerDepositWei
    ) {
      this.channel = channel

      // Создаем нулевой стейт
      // и устанавливаем депозит игры
      this.channelState = new ChannelState(
        this._params.Eth,
        this.channelId,
        this._params.userId,
        this._params.Eth.getAccount().address,
        channel.playerBalance,
        channel.bankrollerBalance,

        this._params.Eth.getAccount().address // owner
      )
      this.channelState.createState(0, 0)

      this.emit("info", {
        event: "OpenChannel checked",
        data: {
          player: channel.player.toLowerCase(),
          bankroller: channel.bankroller.toLowerCase(),
          playerBalance: channel.playerBalance,
          bankrollerBalance: channel.bankrollerBalance
        }
      })
      return channel
    } else {
      throw new Error("channel not found")
    }
  }

  /*
    Call game logic function and return result to player
   */

  async callPlay(
    userBets: number[],
    gameData: {seed:string, randomRanges:GameData['randomRanges'], custom?:GameData['custom']},
    session: number,
    sign: string
  ) {
    const userAllBetsWei = Number(betsSumm(userBets))

    const lastState = this.channelState.getState()
    const curSession = this.channelState.getSession()

    // check session
    if (session !== curSession) {
      throw new Error("incorrect session user:" + session + "!=" + curSession)
    }

    // Check prev channel states from user
    if (this.channelState.hasUnconfirmed(this.playerAddress)) {
      throw new Error(
        "Player " + this.playerAddress + " not confirm previous channel state"
      )
    }

    // enough bets ?
    if (lastState._playerBalance < userAllBetsWei) {
      throw new Error(
        `Player ${this.playerAddress} not enougth money for this bet, balance ${
          lastState._playerBalance
        } < ${userAllBetsWei}`
      )
    }

    // msg data for hashing by sha3
    // for check sig and random genrate
    const hashGameData = sha3( ...[
      { t: "bytes32", v: gameData.seed },
      { t: "uint256", v: flatternArr(gameData.randomRanges) }
      ].concat( Object.values(gameData.custom) )
    )
    const msgData: SolidityTypeValue[] = [
      { t: "bytes32", v: lastState._id },
      { t: "uint256", v: ''+curSession },
      { t: "uint256", v: bets2decs(userBets) },
      { t: "bytes32", v: hashGameData },
    ]
    const msgHash = sha3(...msgData)

    // Check msg data signature
    const recoverOpenkey = this._params.Eth.recover(msgHash, sign)
    if (recoverOpenkey.toLowerCase() !== this.playerAddress.toLowerCase()) {
      throw new Error("Invalid signature")
    }

    //
    // Generate random
    //
    const rndSig  = this.Rsa.sign(msgHash).toString() 
    const randoms = generateRandom( gameData.randomRanges, rndSig) 

    // Call game logic functions with generated randoms
    const playResult = this._gameLogic.play(userBets, gameData, randoms)

    // Change balances on channel state
    const state = this.channelState.createState(userAllBetsWei, +bet2dec(playResult.profit) )

    // piu-piu-piu
    // the casino never loses ;)
    return { playResult, randoms, rndSig, state }
  }

  confirmState(state: State) {
    const stateFromPlayerConfirmed = this.channelState.confirmState(
      state,
      this.playerAddress
    )
    return stateFromPlayerConfirmed
  }

  consentCloseChannel(stateSignature: string): ConsentResult {
    /** Get bankroller Address and last state for close channel */
    const bankrollerAddress = this._params.Eth.getAccount().address
    const lastState = this.channelState.getState()

    /** create structure for recover signature */
    const consentData: SolidityTypeValue[] = [
      { t: "bytes32", v: lastState._id },
      { t: "uint", v: "" + lastState._playerBalance },
      { t: "uint", v: "" + lastState._bankrollerBalance },
      { t: "uint", v: "" + lastState._totalBet },
      { t: "uint", v: "" + lastState._session },
      { t: "bool", v: true }
    ]
    const consentHash = sha3(...consentData)
    /**
     * Recover address with signature and params
     * if recover open key not equal player address
     * then throw error
     */
    const recoverOpenkey = this._params.Eth.recover(consentHash, stateSignature)
    if (recoverOpenkey.toLowerCase() !== this.playerAddress.toLowerCase()) {
      throw new Error("Invalid signature")
    }

    /** Sign and return consent structure */
    const consentSignature = this._params.Eth.signHash(consentHash)
    return { consentSignature, bankrollerAddress }
  }

  async checkCloseChannel(): Promise<any> {
    /** Check channel state */
    const channel = await this._params.gameContractInstance.methods
      .channels(this.channelId)
      .call()

    /**
     * If state = 2 then channel closed
     * and game over
     */
    if (
      channel.state === "2" &&
      channel.player.toLowerCase() === this._params.userId.toLowerCase() &&
      channel.bankroller.toLowerCase() ===
        this._params.Eth.getAccount().address.toLowerCase()
    ) {
      this.channelState = null
      this.emit("info", {
        event: "Close channel checked",
        data: {
          player: channel.player.toLowerCase(),
          bankroller: channel.bankroller.toLowerCase(),
          playerBalance: channel.playerBalance,
          bankrollerBalance: channel.bankrollerBalance
        }
      })

      return channel
    } else {
      throw new Error("channel not found")
    }
  }

  getView() {
    const b = this.channelState.getData()

    const balances = {
      deposit: b.deposits.bankroller,
      playerBalance: b.balance.player,
      bankrollerBalance: b.balance.bankroller,
      profit: b.profit.bankroller,
      playerAddress: this.playerAddress
    }

    for (const k in balances) {
      if (!balances[k]) continue
      balances[k] = bet2dec(balances[k])
    }
    return balances
  }
}
