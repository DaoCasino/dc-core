import {
  IRsa,
  GameData,
  IGameLogic,
  ConnectParams,
  PlayParams,
  SignedResponse,
  OpenChannelParams,
  CloseChannelParams,
  DAppInstanceParams,
  IDAppDealerInstance,
  IDAppPlayerInstance,
  GetChannelDataParams,
  ChannelStateData,
  State
} from "./interfaces/index"

import { generateRandom } from "./Rnd"

import {
  sha3,
  makeSeed,
  dec2bet,
  bet2dec,
  bets2decs,
  betsSumm,
  flatternArr,
  SolidityTypeValue
} from "dc-ethereum-utils"

import { Logger } from "dc-logging"
import { config } from "dc-configs"
import { ChannelState } from "./ChannelState"
import { EventEmitter } from "events"
import { Rsa } from "./Rsa"

const log = new Logger("PeerInstance")

export class DAppPlayerInstance extends EventEmitter
  implements IDAppPlayerInstance {
  private _peer: IDAppPlayerInstance
  private _dealer: IDAppDealerInstance
  private _config: any
  private _params: DAppInstanceParams
  private _gameLogic: IGameLogic

  pRsa: IRsa
  channelId: string
  channelState: ChannelState
  playerAddress: string

  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this._config = config.default
    this._gameLogic = this._params.gameLogicFunction()
    this.playerAddress = this._params.Eth.getAccount().address
    this.pRsa = new Rsa(null)
    log.debug("Peer instance init")
  }

  eventNames() {
    return ["info"]
  }

  onPeerEvent(event: string, func: (data: any) => void) {
    this._dealer.on(event, func)
  }

  async start(): Promise<void> {
    this._dealer =
      !this._dealer &&
      (await this._params.roomProvider.getRemoteInterface<IDAppDealerInstance>(
        this._params.roomAddress
      ))
  }

  getChannelStateData(): ChannelStateData {
    return this.channelState.getData()
  }

  async connect(connectData: ConnectParams): Promise<any> {
    /** Parse method params */
    const { playerDeposit } = connectData

    /** Check peer balance */
    log.info(`🔐 Open channel with deposit: ${playerDeposit}`)
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
    if (userBalance.bet.balance < playerDeposit) {
      throw new Error(`
        Not enough BET: ${userBalance.bet.balance}
        to open channel for: ${playerDeposit}
      `)
    }

    /**
     * Check allowance deposit on contract
     * and if allowance not enough then
     * start ERC20 approve
     */
    log.info(`start ERC20ApproveSafe ${playerDeposit}`)
    await this._params.Eth.ERC20ApproveSafe(
      this._params.gameContractAddress,
      playerDeposit
    )

    /** Emit info for approved deposit */
    this.emit("info", {
      event: "deposit approved",
      address: this._params.Eth.getAccount().address,
      gameAddress: this._params.gameContractAddress,
      amount: playerDeposit
    })

    /** Create channel ID create args peer */
    this.channelId = makeSeed()
    const args = {
      channelId: this.channelId,
      playerAddress: this.playerAddress,
      playerDeposit
    }

    /** Sign peer args */
    const argsToSign: SolidityTypeValue[] = [
      { t: "bytes32", v: args.channelId },
      { t: "address", v: args.playerAddress },
      { t: "uint", v: "" + args.playerDeposit }
    ]

    const argsSignature: string = this._params.Eth.signData(argsToSign)

    /**
     * Request to dealer args to
     * check and get data for open channel
     */
    const {
      response: peerResponse,
      signature
    } = await this._dealer.getOpenChannelData(args, argsSignature)

    const { n, e } = peerResponse
    this.pRsa.setNE({ n, e })

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
          playerDeposit,
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
      this._params.gameContractAddress,
      peerResponse.bankrollerAddress
    )
    if (bankrollerAllowance < bankrollerDeposit) {
      throw new Error(`
        Bankroller allowance too low ${bankrollerAllowance},
        for deposit ${bankrollerDeposit}
      `)
    }

    this.emit("info", {
      event: "Bankroller allowance checked",
      address: peerResponse.bankrollerAddress,
      gameAddress: this._params.gameContractAddress,
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
      { t: "uint", v: "" + bet2dec(playerDeposit) },
      { t: "uint", v: "" + peerResponse.bankrollerDepositWei },
      { t: "uint", v: peerResponse.openingBlock },
      { t: "bytes", v: peerResponse.n },
      { t: "bytes", v: peerResponse.e }
    ]
    const recoverOpenkey: string = this._params.Eth.recover(
      sha3(...toRecover),
      signature
    )
    if (
      recoverOpenkey.toLowerCase() !==
      peerResponse.bankrollerAddress.toLowerCase()
    ) {
      throw new Error("Invalid signature")
    }

    /** Open channel with params */
    const channelStatus = await this.openChannel(peerResponse, signature)
    if (channelStatus.state === "1") {
      this.emit("info", {
        event: "Channel open",
        data: { channelStatus, peerResponse }
      })
      return { ...channelStatus, ...peerResponse }
    }
  }

  async openChannel(
    params: OpenChannelParams,
    signature: string
  ): Promise<any> {
    /** Create open channel arguments */
    const openChannelArgs = [
      params.channelId,
      params.playerAddress,
      params.bankrollerAddress,
      params.playerDepositWei,
      params.bankrollerDepositWei,
      params.openingBlock.toString(),
      params.n,
      params.e,
      signature
    ]

    try {
      /** Start open channel tx and check status */
      log.debug(`start openChannel transaction`)
      const openChannelTX = await this._params.Eth.sendTransaction(
        this._params.gameContractInstance,
        "openChannel",
        openChannelArgs
      )

      if (openChannelTX.status) {
        /** Check dealer channel */
        const checkChannel = await this._dealer.checkOpenChannel()
        if (checkChannel.state) {
          /** Create channel state instance and save start save */
          this.channelState = new ChannelState(
            this._params.Eth,
            params.channelId,
            this._params.userId,
            params.bankrollerAddress,
            +params.playerDepositWei,
            +params.bankrollerDepositWei,
            this._params.Eth.getAccount().address // owner
          )
          this.channelState.createState(0, 0)
          return { ...checkChannel }
        }
      }
    } catch (error) {
      throw error
    }
  }

  async play(params: PlayParams) {
    const { userBets } = params

    // Add entropy(seed) to gameData
    const gameData = { seed: makeSeed(), ...params.gameData }

    const flatRanges = flatternArr(gameData.randomRanges)
    // Create gameData hash with rules from logic.js
    const hashGameData = sha3(
      ...[
        { t: "bytes32", v: gameData.seed },
        { t: "uint256", v: flatRanges }
      ].concat(this._gameLogic.customDataFormat(gameData.custom))
    )

    // hash of all data use for generate random
    // and sign sended message
    const msgData: SolidityTypeValue[] = [
      { t: "bytes32", v: this.channelId },
      { t: "uint256", v: "" + this.channelState.getSession() },
      { t: "uint256", v: bets2decs(userBets) },
      { t: "bytes32", v: hashGameData }
    ]
    const roundHash = sha3(...msgData)

    // Call gamelogic function on bankrollerside
    const dealerRes = await this._dealer.callPlay(
      userBets,
      gameData,
      this.channelState.getSession(),
      // sign msg
      await this._params.Eth.signHash(roundHash)
    )

    // check our random hash, dealer sign
    if (!this.pRsa.verify(roundHash, dealerRes.rndSig)) {
      throw new Error("Invalid random sig")
      // this.openDisputeUI()
    }

    const randomsArr = generateRandom(gameData.randomRanges, dealerRes.rndSig)

    // Call gamelogic function on player side
    const playResult = this._gameLogic.play(userBets, gameData, randomsArr)

    if (playResult.profit !== dealerRes.playResult.profit) {
      this.openDisputeUI()
    }

    // Create our channel state
    const state = this.channelState.createState(
      betsSumm(userBets),
      +bet2dec(playResult.profit)
    )

    log.debug("dealerRes", dealerRes)
    log.debug("profit", playResult.profit)
    log.debug("player state", state)

    // try add bankroller sign state
    this.channelState.confirmState(
      dealerRes.state,
      this.channelState.bankrollerOpenkey
    )

    // Send our signed state to dealer
    // dealerRes.state
    const confirmed = await this._dealer.confirmState(state)

    return {
      profit: playResult.profit,
      data: playResult.data,
      randoms: randomsArr
    }
  }

  async disconnect() {
    /**
     * Get player address and last state for close
     * channel and create structure for sign last state
     */
    // const playerAddress = this._params.Eth.getAccount().address
    const lastState = this.channelState.getState()
    const closeChannelData: SolidityTypeValue[] = [
      { t: "bytes32", v: lastState._id },
      { t: "uint", v: "" + lastState._playerBalance },
      { t: "uint", v: "" + lastState._bankrollerBalance },
      { t: "uint", v: "" + lastState._totalBet },
      { t: "uint", v: "" + lastState._session },
      { t: "bool", v: true }
    ]
    const closeChannelDataHash = sha3(...closeChannelData)
    /**
     * Sign last state for close channel and request to
     * consent close channel bankroller
     */
    const signLastState = this._params.Eth.signHash(closeChannelDataHash)
    const {
      consentSignature,
      bankrollerAddress
    } = await this._dealer.consentCloseChannel(signLastState)
    /**
     * Check consent bankroller
     * if recover open key not equal bankroller address
     * throw error
     */
    const recoverOpenkey = this._params.Eth.recover(
      closeChannelDataHash,
      consentSignature
    )
    if (recoverOpenkey.toLowerCase() !== bankrollerAddress.toLowerCase()) {
      throw new Error("Invalid signature")
    }

    /** Send close channel transaction */
    const closeChannelTX = await this.closeChannel(lastState, consentSignature)
    return { ...lastState, ...closeChannelTX }
  }

  async closeChannel(
    params: CloseChannelParams,
    paramsSignature: string
  ): Promise<any> {
    /** Generate params for close channel with method params */
    const closeParams = [
      params._id,
      "" + params._playerBalance,
      "" + params._bankrollerBalance,
      "" + params._totalBet,
      "" + params._session,
      paramsSignature
    ]

    try {
      log.debug(`start close transaction`)
      const closeChannelTX = await this._params.Eth.sendTransaction(
        this._params.gameContractInstance,
        "closeByConsent",
        closeParams
      )

      /**
       * If TX success then benkroller
       * check channel status if status = 2
       * then channel closed and game over
       */
      if (closeChannelTX.status) {
        const checkChannel = await this._dealer.checkCloseChannel()
        if (checkChannel.state === "2") {
          this.channelState = null
          this.emit("info", { event: "Channel closed" })
          return { ...checkChannel }
        }
      }
    } catch (error) {
      throw error
    }
  }

  openDispute() {
    // updateChannel
    // get channel state
    // openDispute
    //   let res = await player.sendTransaction(GameContract, 'updateChannel', [
    //       id,
    //       playerBalance,
    //       bankrollerBalance,
    //       totalBet,
    //       session,
    //       bankrollerSignature
    //   ])
    //  let res = await player.sendTransaction(GameContract, 'openDispute', [
    //      id,
    //      session,
    //      bets,
    //      gameData,
    //      playerSignature
    //  ])
  }

  openDisputeUI() {
    const dialog = msg => {
      return confirm(msg) || log.info(msg)
    }
    if (dialog("Open dispute?")) {
    }
    if (dialog("Close channel with last state?")) {
    }

    if (dialog("Do nothing?")) {
    }
  }
}
