import {
  Rsa,
  IRsa,
  IGameLogic,
  CallParams,
  ConnectParams,
  ConsentResult,
  SignedResponse,
  OpenChannelParams,
  IDAppPlayerInstance,
  DAppInstanceParams,
  IDAppDealerInstance,
  GetChannelDataParams
} from "./interfaces/index"

import {
  sha3,
  dec2bet,
  bet2dec,
  makeSeed,
  SolidityTypeValue
} from "dc-ethereum-utils"

import { Logger } from "dc-logging"
import { config } from "dc-configs"
import { Balances } from "./Balances"
import { ChannelState } from "./ChannelState"
import { EventEmitter } from "events"

const log = new Logger("PeerInstance")

export default class DAppDealerInstance extends EventEmitter implements IDAppDealerInstance {
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
  Balances: Balances
  playerDepositWei: string
  bankrollerDeposit: number
  bankrollerDepositWei: string

  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this._config = config
    this._gameLogic = this._params.gameLogicFunction(this.Balances)
    this.Balances = new Balances()
    
    this.Rsa = new Rsa()
    log.debug('Dealer instance init')
  }

  eventNames() {
    return ["info"]
  }

  onPeerEvent(event: string, func: (data: any) => void) {
    this._peer.on(event, func)
  }

  startServer(): any {
    return this._params.roomProvider.exposeSevice(
      this._params.roomAddress,
      this,
      true
    )
  }

  async getOpenChannelData(
    params: GetChannelDataParams,
    paramsSignature: string
  ): Promise<SignedResponse<OpenChannelParams>> {
    /** Parse params */
    const {
      channelId,
      playerAddress,
      playerDeposit,
      gameData
    } = params

    /**
     * Create structure for recover
     * and recover openkey with structure and signature
     * if recover open key not equal player address
     * throw error
     */
    const toRecover: SolidityTypeValue[] = [
      { t: "bytes32", v: channelId },
      { t: "address", v: playerAddress },
      { t: "uint", v: '' + playerDeposit },
      { t: "uint", v: gameData }
    ]
    const recoverOpenkey = this._params.Eth.recover(toRecover, paramsSignature)
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
      log.debug('' + playerDeposit)
      const playerDepositWei = bet2dec(playerDeposit)
      const bankrollerDepositWei = bet2dec(bankrollerDeposit)
      this.playerDepositWei = playerDepositWei
      this.bankrollerDepositWei = bankrollerDepositWei
  
      const response = {
        channelId,
        playerAddress,
        playerDepositWei,
        bankrollerAddress,
        bankrollerDepositWei,
        openingBlock,
        gameData,
        n,
        e
      }
    
      // Args for open channel transaction
      const toSign: SolidityTypeValue[] = [
        { t: "bytes32", v: channelId },
        { t: "address", v: playerAddress },
        { t: "address", v: bankrollerAddress },
        { t: "uint", v: playerDepositWei },
        { t: "uint", v: bankrollerDepositWei },
        { t: "uint", v: openingBlock },
        { t: "uint", v: gameData },
        { t: "bytes", v: n },
        { t: "bytes", v: e }
      ]
  
      /** Sign args for open channel */
      const signature = this._params.Eth.signHash(toSign)
      return { response, signature }
    } catch (error) {
      throw error
    }
  }

  async checkOpenChannel(): Promise<any | Error> {
    const bankrollerAddress = this._params.Eth.getAccount().address.toLowerCase()
    const channel = await this._params.payChannelContract.methods
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

      // Устанавливаем депозит игры
      this.Balances._setDeposits(
        channel.playerBalance,
        channel.bankrollerBalance
      )

      // Создаем нулевой стейт
      this.channelState = new ChannelState(
        this._params.userId,
        this._params.Eth
      )
      this.channelState.saveState(
        {
          _id: this.channelId,
          _playerBalance: dec2bet(this.Balances.getBalances().balance.player),
          _bankrollerBalance: dec2bet(this.Balances.getBalances().balance.bankroller),
          _totalBet: "0",
          _session: 0
        },
        bankrollerAddress
      )

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


  async play({userBet, gameData, seed, nonce, sign}){
    

    return {
      profit: 1,
      randomSignature: '',
      randoms: [1,2],
    }
  }

  consentCloseChannel(stateSignature: string): ConsentResult {
    /** Get bankroller Address and last state for close channel */
    const bankrollerAddress = this._params.Eth.getAccount().address
    const lastState = this.channelState.getState(bankrollerAddress)

    /** create structure for recover signature */
    const consentData: SolidityTypeValue[] = [
      { t: "bytes32", v: lastState._id },
      { t: "uint", v: "" + lastState._playerBalance },
      { t: "uint", v: "" + lastState._bankrollerBalance },
      { t: "uint", v: "" + lastState._totalBet },
      { t: "uint", v: lastState._session },
      { t: "bool", v: true }
    ]

    /**
     * Recover address with signature and params
     * if recover open key not equal player address
     * then throw error
     */
    const recoverOpenkey = this._params.Eth.recover(consentData, stateSignature)
    if (recoverOpenkey.toLowerCase() !== this.playerAddress.toLowerCase()) {
      throw new Error("Invalid signature")
    }

    /** Sign and return consent structure */
    const consentSignature = this._params.Eth.signHash(consentData)
    return { consentSignature, bankrollerAddress }
  }

  async checkCloseChannel(): Promise<any | Error> {
    /** Check channel state */
    const channel = await this._params.payChannelContract.methods
      .channels(this.channelId)
      .call()
    
    /**
     * If state = 2 then channel closed
     * and game over
     */
    if (
      channel.state === "2" &&
      channel.player.toLowerCase() === this._params.userId.toLowerCase() &&
      channel.bankroller.toLowerCase() === this._params.Eth.getAccount().address.toLowerCase()
    ) {
      this.Balances = null
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
    const b = this.Balances.getBalances()

    return {
      deposit           : b.deposits.bankroller,
      playerBalance     : b.balance.player,
      bankrollerBalance : b.balance.bankroller,
      profit            : b.profit.bankroller,
      playerAddress     : this.playerAddress
    }
  }

}