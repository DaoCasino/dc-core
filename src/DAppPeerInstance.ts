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

export default class DAppPeerInstance extends EventEmitter implements IDAppPeerInstance {
  private _peer: IDAppPeerInstance
  private _dealer: IDAppDealerInstance
  private _config: any
  private _params: DAppInstanceParams
  private _gameLogic : IGameLogic
  
  Rsa: IRsa
  channelId: string
  channelState: ChannelState
  playerAddress: string
  payChannelLogic: PayChannelLogic
  
  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this._config = config
    this._gameLogic = this._params.gameLogicFunction(this.payChannelLogic)
    this.payChannelLogic = new PayChannelLogic()

    this.Rsa = new Rsa()
    log.debug('Peer instance init')
  }

  eventNames() {
    return ["info"]
  }

  onPeerEvent(event: string, func: (data: any) => void) {
    this._dealer.on(event, func)
  }

  async startClient(): Promise<any | Error> {
    this._dealer = (!this._dealer) && await this._params.roomProvider.getRemoteInterface<
      IDAppDealerInstance
    >(this._params.roomAddress)
  }

  async connect(connectData: ConnectData): Promise<any | Error> {
    /** Parse method params */
    const { deposit, gameData } = connectData

    /** Check peer balance */
    log.info(`🔐 Open channel with deposit: ${deposit}`)
    const userBalance = await this._params.Eth.getBalances()
    
    /**
     * If user Ethereum balance less
     * minimum balance for game then throw Error
     */
    if (userBalance.eth.balance < this._config.minimumEth) {
      throw new Error(`
        Not enough ETH to open channel: ${userBalance.eth.balance}.
        Need ${this._config.minimumEth}
      `)
    }

    /**
     * If peer BET balance less peer deposit
     * then throw Error
     */
    if (userBalance.bet.balance < deposit) {
      throw new Error(`
        Not enough BET: ${userBalance.bet.balance}
        to open channel for: ${deposit}
      `)
    }

    /**
     * Check allowance deposit on contract
     * and if allowance not enough then
     * start ERC20 approve
     */
    log.info(`start ERC20ApproveSafe ${deposit}`)
    await this._params.Eth.ERC20ApproveSafe(
      this._params.payChannelContractAddress,
      deposit
    )

    /** Emit info for approved deposit */
    this.emit("info", {
      event: "deposit approved",
      address: this._params.Eth.getAccount().address,
      gameAddress: this._params.payChannelContractAddress,
      amount: deposit
    })

    /** Create channel ID create args peer */
    this.channelId = makeSeed()
    const args = {
      channelId: this.channelId,
      playerAddress: this._params.Eth.getAccount().address,
      playerDeposit: deposit,
      gameData
    }

    /** Sign peer args */
    const argsToSign: SolidityTypeValue[] = [
      { t: "bytes32", v: args.channelId },
      { t: "address", v: args.playerAddress },
      { t: "uint", v: '' + args.playerDeposit },
      { t: "uint", v: args.gameData }
    ]
    const argsSignature: string = this._params.Eth.signHash(argsToSign)
    
    /** 
     * Request to dealer args to
     * check and get data for open channel 
     */
    const {
      response: peerResponse,
      signature
    } = await this._dealer.getOpenChannelData(args, argsSignature)

    /**
     * Check bankroller deposit
     * if deposit bankroller not equal
     * plyaer deposit * depositX(in rules) then
     * throw error
     */
    const bankrollerDeposit: number = dec2bet(peerResponse.bankrollerDepositWei)
    if (this._params.rules.depositX * args.playerDeposit > bankrollerDeposit) {
      log.debug({
        msg: "Bankroller open channel bad deposit",
        data: {
          bankrollerDeposit,
          deposit,
          depositX: this._params.rules.depositX
        }
      })

      throw new Error("Bankroller open channel deposit too low")
    }
    
    /**
     * Check bankroller allowance for
     * game contract if allowance not enought
     * throw error
     */
    const bankrollerAllowance: number = await this._params.Eth.allowance(
      this._params.payChannelContractAddress,
      peerResponse.bankrollerAddress
    )
    if (bankrollerAllowance < dec2bet(bankrollerDeposit)) {
      throw new Error(`
        Bankroller allowance too low ${bankrollerAllowance},
        for deposit ${bankrollerDeposit}
      `)
    }

    this.emit("info", {
      event: "Bankroller allowance checked",
      address: peerResponse.bankrollerAddress,
      gameAddress: this._params.payChannelContractAddress,
      amount: bankrollerDeposit
    })

    /**
     * Check bankroller signature
     * with response if recover open key
     * not equal bankroller address throw error
     */
    const toRecover: SolidityTypeValue[] = [
      { t: "bytes32", v: this.channelId },
      { t: "address", v: args.playerAddress },
      { t: "address", v: peerResponse.bankrollerAddress },
      { t: "uint", v: '' + bet2dec(deposit) },
      { t: "uint", v: peerResponse.bankrollerDepositWei },
      { t: "uint", v: peerResponse.openingBlock },
      { t: "uint", v: gameData },
      { t: "bytes", v: peerResponse.n },
      { t: "bytes", v: peerResponse.e }
    ]
    const recoverOpenkey: string = this._params.Eth.recover(toRecover, signature)
    if (recoverOpenkey.toLowerCase() !== peerResponse.bankrollerAddress.toLowerCase()) {
      throw new Error("Invalid signature")
    }

    /** Open channel with params */
    const channelStatus = await this.openChannel(peerResponse, signature)
    if (channelStatus.state === '1') {
      this.emit("info", { event: "Channel open", data: { channelStatus, peerResponse } })
      return { ...channelStatus, ...peerResponse }
    }
  }

  async openChannel(params: OpenChannelData, signature: string): Promise<any | Error> {
    /** Create open channel arguments */
    const openChannelArgs = [
      params.channelId,
      params.playerAddress,
      params.bankrollerAddress,
      params.playerDepositWei,
      params.bankrollerDepositWei,
      params.openingBlock.toString(),
      params.gameData,
      params.n,
      params.e,
      signature
    ]

    try {
      /** Start open channel tx and check status */
      log.debug(`start openChannel transaction`)
      const openChannelTX = await this._params.Eth.sendTransaction(
        this._params.payChannelContract,
        "openChannel",
        openChannelArgs
      )

      if (openChannelTX.status) {
        /** Check dealer channel */
        const check = await this._dealer.checkOpenChannel()
        if (check.state) {
          /** Set start deposit with game */
          this.payChannelLogic._setDeposits(
            dec2bet(params.playerDepositWei),
            dec2bet(params.bankrollerDepositWei)  
          )

          /** Create channel state instance and save start save */
          this.channelState = new ChannelState(this._params.userId, this._params.Eth)
          this.channelState.saveState(
            {
              _id: params.channelId,
              _playerBalance: bet2dec(
                this.payChannelLogic._getBalance().player
              ),
              _bankrollerBalance: bet2dec(
                this.payChannelLogic._getBalance().bankroller
              ),
              _totalBet: "0",
              _session: 0
            },
            params.playerAddress
          )

          return { ...check }
        }
      }
    } catch (error) {
      throw error
    }
  }
}