import {
  Rsa,
  IRsa,
  IGameLogic,
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
  remove0x,
  SolidityTypeValue
} from "dc-ethereum-utils"

import { Logger } from "dc-logging"
import { config } from "dc-configs"
import { ChannelState } from "./ChannelState"
import { EventEmitter } from "events"

const log = new Logger("DealerInstance")

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
  playerDepositWei: string
  bankrollerDeposit: number
  bankrollerDepositWei: string

  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this._config = config
    this._gameLogic = this._params.gameLogicFunction()
    
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


      // Создаем нулевой стейт
      // и устанавливаем депозит игры
      this.channelState = new ChannelState(
        this._params.Eth,
        this.channelId,
        this._params.userId,
        channel.playerBalance,
        channel.bankrollerBalance
      )
      this.channelState.saveState(0, bankrollerAddress)

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

  async play(userBet:number, gameData:any, seed:string, session:number, sign:string){
    const userBetWei = bet2dec(userBet)
    const lastState = this.channelState.getState( this._params.Eth.getAccount().address )

    const curSession = 1 + lastState._session
    // check session
    if (session !== curSession) {
      throw new Error('incorrect session user:'+session+'!='+curSession) 
    }

    // Проверяем нет ли неподписанных юзером предыдущих состояний
    if (lastState._session > 0 && this.channelState.hasUnconfirmed()) {
      throw new Error('Player ' + this.playerAddress + ' not confirm previous channel state') 
    }

    // Проверяем что юзера достаточно бетов для этой ставки
   if (lastState._playerBalance < 1*userBetWei ) {
     throw new Error(`Player ' + this.playerAddress + ' not enougth money for this bet, balance ${lastState._playerBalance} < ${userBet}`)
   }

   // проверка подписи
   const toVerifyHash: SolidityTypeValue[] = [
     {t: 'bytes32', v: lastState._id },
     {t: 'uint',    v: curSession      },
     {t: 'uint',    v: '' + userBetWei  },
     {t: 'uint',    v: gameData      },
     {t: 'bytes32', v: seed          }
   ]

  
   const recoverOpenkey = this._params.Eth.recover(sha3(...toVerifyHash), sign)
   if (recoverOpenkey.toLowerCase() !== this.playerAddress.toLowerCase()) {
     throw new Error("Invalid signature")
   }

    // Подписываем/генерируем рандом
    const rndHashArgs = [
      {t: 'bytes32', v: lastState._id   },
      {t: 'uint',    v: curSession      },
      {t: 'uint',    v: '' + userBetWei },
      {t: 'uint',    v: gameData        },
      {t: 'bytes32', v: seed            }
    ]

    const rndHash = sha3(...rndHashArgs)
    const rndSign = this.Rsa.sign( rndHash )

    // TODO : generate rnds by params
    const rndNum = this._params.Eth.numFromHash( rndHash )
    const randoms = [rndNum]
    const profit = this._gameLogic.play(userBet, gameData, randoms)

    // Меняем баланс в канале
    this.channelState._addTX(1*bet2dec(profit))
    this.channelState._addTotalBet(1*userBetWei)

    // Сохраняем подписанный нами последний стейт канала
    const state = this.channelState.saveState(curSession, this._params.Eth.getAccount().address )

    return { 
      state, profit, randoms, 
      randomSignature : rndSign, 
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
      deposit           : b.deposits.bankroller,
      playerBalance     : b.balance.player,
      bankrollerBalance : b.balance.bankroller,
      profit            : b.profit.bankroller,
      playerAddress     : this.playerAddress
    }

    for(const k in balances){
      if (!balances[k]) continue
      balances[k] = bet2dec(balances[k])
    }
    return balances
  }

}