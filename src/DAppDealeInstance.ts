import {
  Rsa,
  IRsa,
  IGameLogic,
  CallParams,
  ConnectData,
  SignedResponse,
  OpenChannelData,
  OpenChannelParams,
  IDAppPeerInstance,
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
import { PayChannelLogic } from "./PayChannelLogic"
import { ChannelState } from "./ChannelState"
import { EventEmitter } from "events"

const log = new Logger("PeerInstance")

export default class DAppDealerInstance extends EventEmitter implements IDAppDealerInstance {
  private _peer: IDAppPeerInstance
  private _dealer: IDAppDealerInstance
  private _config: any
  private _params: DAppInstanceParams
  private _gameLogic: IGameLogic
  
  Rsa: IRsa
  channel: any
  channelId: string
  channelState: ChannelState
  playerAddress: string
  payChannelLogic: PayChannelLogic
  playerDepositWei: string
  bankrollerDeposit: number
  bankrollerDepositWei: string

  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this._config = config
    this._gameLogic = this._params.gameLogicFunction(this.payChannelLogic)
    this.payChannelLogic = new PayChannelLogic()
    
    this.Rsa = new Rsa()
    log.debug('Dealer instance init')
  }

  getView() {
    return {
      ...this.payChannelLogic.getView(),
      playerAddress: this.playerAddress
    }
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
  ): Promise<SignedResponse<OpenChannelData>> {
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
    const openingBlock = await this._params.Eth.getBlockNumber()

    // Args for open channel transaction
    const { n, e } = this.Rsa.getNE()
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
      this.payChannelLogic._setDeposits(
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
          _playerBalance: this.payChannelLogic._getBalance().player,
          _bankrollerBalance: this.payChannelLogic._getBalance().bankroller,
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
}