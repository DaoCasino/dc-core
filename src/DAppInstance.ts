import {
  IDAppInstance,
  OpenChannelParams,
  SignedResponse,
  OpenChannelData,
  DAppInstanceParams,
  IRsa, Rsa,
  CallParams,
  IGameLogic,
  GetChannelDataParams
} from './interfaces/index'
import { PayChannelLogic } from './PayChannelLogic'
import { ChannelState }    from './ChannelState'
import { sha3, dec2bet, makeSeed, bet2dec, SolidityTypeValue } from 'dc-ethereum-utils'
import { Logger } from 'dc-logging'
import { config } from 'dc-configs'

import Contract         from 'web3/eth/contract'
import { EventEmitter } from 'events'

const logger      = new Logger('DAppInstance')
const MINIMUM_ETH = 0.001
const GAS_LIMIT   = 4600000
const GAS_PRICE   = 40 * 1000000000

export class DAppInstance extends EventEmitter implements IDAppInstance {
  private _peer        : IDAppInstance
  private _gameLogic   : IGameLogic
  _params              : DAppInstanceParams
  Rsa                  : IRsa
  _peerRsa             : IRsa
  channelId            : string
  playerAddress        : string
  playerDeposit        : number
  playerDepositWei     : string
  bankrollerDeposit    : number
  bankrollerDepositWei : string
  channel              : any
  payChannelLogic      : PayChannelLogic
  nonce                : number
  channelState         : ChannelState
  closeByConsentData   : any

  constructor(params: DAppInstanceParams) {
    super()
    this._params = params
    this.nonce = 0
    this.Rsa = new Rsa()

    this.payChannelLogic = new PayChannelLogic()
    this._gameLogic = this._params.gameLogicFunction(this.payChannelLogic)
  }
  getView() {
    return {
      ...this.payChannelLogic.getView(),
      playerAddress: this.playerAddress,
    }
  }
  eventNames() {
    return ['info']
  }
  onPeerEvent(event: string, func: (data: any) => void) {
    this._peer.on(event, func)
  }

  startServer() {
    return this._params.roomProvider.exposeSevice(
      this._params.roomAddress,
      this,
      true
    )
  }
  async startClient() {
    if (!this._peer) {
      this._peer = await this._params.roomProvider.getRemoteInterface<
        IDAppInstance
      >(this._params.roomAddress)
    }
  }
  async openChannel(params: OpenChannelParams) {
    const { playerDeposit, gameData } = params

    logger.info(`🔐 Open channel with deposit: ${playerDeposit}`)
    const userBalance = await this._params.Eth.getBalances()    
    if (userBalance.eth.balance < MINIMUM_ETH) {
      throw new Error(
        `Not enough ETH to open channel: ${
          userBalance.eth.balance
        }. Need ${MINIMUM_ETH}`
      )
    }
    
    if (userBalance.bet.balance < playerDeposit) {
      throw new Error(
        `Not enough BET: ${
          userBalance.bet.balance
        } to open channel for: ${playerDeposit}`
      )
    }

    logger.info(`start ERC20ApproveSafe ${playerDeposit}`)
    await this._params.Eth.ERC20ApproveSafe(
      this._params.payChannelContractAddress,
      playerDeposit
    )
    
    const channelId = makeSeed()
    this.channelId = channelId
    
    const args = {
      channelId,
      playerAddress: this._params.Eth.getAccount().address,
      playerDeposit,
      gameData
    }

    const argsSignature = this._params.Eth.signHash([
      { t: 'bytes32', v: args.channelId     },
      { t: 'address', v: args.playerAddress },
      { t: 'uint',    v: args.playerDeposit },
      { t: 'uint',    v: args.gameData      }
    ])
    
    this.emit('info', {
      event       : 'deposit approved',
      address     : this._params.Eth.getAccount().address,
      gameAddress : this._params.payChannelContractAddress,
      amount      : playerDeposit,
    })

    const {
      response: peerResponse,
      signature,
    } = await this._peer.getOpenChannelData(args, argsSignature)
    const {
      bankrollerDepositWei,
      playerDepositWei,
      bankrollerAddress,
      playerAddress,
      openingBlock,
      n,
      e
    } = peerResponse
    const bankrollerDeposit = dec2bet(bankrollerDepositWei)
    

    if (this._params.rules.depositX * args.playerDeposit > bankrollerDeposit) {
      logger.debug({
        msg: 'Bankroller open channel bad deposit',
        data: {
          bankrollerDeposit,
          playerDeposit,
          depositX: this._params.rules.depositX,
        },
      })
      throw new Error('Bankroller open channel deposit too low')
    }
    
    this._peerRsa = new Rsa({ n, e })
    // @TODO: Проверяем возвращаемые банкроллером аргументы путем валидации хеша

    // проверяем апрув банкроллера перед открытием
    const bankrollerAllowance = await this._params.Eth.allowance(
      this._params.payChannelContractAddress,
      bankrollerAddress
    )
    if (bankrollerAllowance < dec2bet(bankrollerDeposit)) {
      throw new Error(
        `Bankroller allowance too low ${bankrollerAllowance} for deposit ${bankrollerDeposit}`
      )
    }
    
    this.emit('info', {
      event       : 'Bankroller allowance checked',
      address     : bankrollerAddress,
      gameAddress : this._params.payChannelContractAddress,
      amount      : bankrollerDeposit
    })
    
    // проверяем что вообще есть БЭТы у банкроллера и их достаточно
    const bankrollerBallance = await this._params.Eth.getBetBalance(bankrollerAddress)

    if (bankrollerBallance < bankrollerDeposit) {
      throw new Error(
        `Bankroller balance too low ${bankrollerAllowance} for deposit ${bankrollerDeposit}`
      )
    }
    
    this.emit('info', {
      event   : 'Bankroller bet balance checked',
      address : bankrollerAddress,
      amount  : bankrollerBallance
    })

    const toRecover: SolidityTypeValue[] = [
      { t: 'bytes32' , v: peerResponse.channelId            } ,
      { t: 'address' , v: peerResponse.playerAddress        } ,
      { t: 'address' , v: peerResponse.bankrollerAddress    } ,
      { t: 'uint'    , v: peerResponse.playerDepositWei     } ,
      { t: 'uint'    , v: peerResponse.bankrollerDepositWei } ,
      { t: 'uint'    , v: peerResponse.openingBlock         } ,
      { t: 'uint'    , v: peerResponse.gameData             } ,
      { t: 'bytes'   , v: peerResponse.n                    } ,
      { t: 'bytes'   , v: peerResponse.e                    }
    ]

    const recoverOpenkey = this._params.Eth.recover(toRecover, signature)
    if (recoverOpenkey.toLowerCase() !== peerResponse.bankrollerAddress.toLowerCase()) {
      throw new Error('Invalid signature')
    }

    // Send open channel TX
    try {
      const openChannelArgs = [
        peerResponse.channelId,
        playerAddress,
        bankrollerAddress,
        playerDepositWei,
        bankrollerDepositWei,
        openingBlock.toString(),
        gameData,
        n, e, signature
      ]

      logger.info(`start openChannel`)
      const openChannelTX = await this._params.Eth.sendTransaction(
        this._params.payChannelContract,
        'openChannel',
        openChannelArgs
      )
  
      if (openChannelTX.status) {
        const check = await this._peer.checkOpenChannel()
        if (check.state) {
          this.payChannelLogic._setDeposits(playerDeposit, bankrollerDeposit)
          
          // Создаем нулевой стейт
          this.channelState = new ChannelState(this._params.userId, this._params.Eth)
          this.channelState.saveState({
            _id: channelId,
            _playerBalance: bet2dec(this.payChannelLogic._getBalance().player),
            _bankrollerBalance: bet2dec(this.payChannelLogic._getBalance().bankroller),
            _totalBet: '0',
            _session: 0,
          }, playerAddress)
          
          this.emit('info', {
            event: 'Channel open',
            data: {}
          })
    
          return {
            ...check,
            ...args
          }
        }
      }
    } catch (error) {
      logger.error('Open channel error', error)
      throw error
    }   
  }
  async getOpenChannelData(
    params: GetChannelDataParams,
    paramsSignature: string
  ): Promise<SignedResponse<OpenChannelData>> {
    // Create RSA keys for user
    const { channelId, playerAddress, playerDeposit, gameData } = params
    
    const toRecover: SolidityTypeValue[] = [
      { t: 'bytes32', v: channelId     },
      { t: 'address', v: playerAddress },
      { t: 'uint',    v: playerDeposit },
      { t: 'uint',    v: gameData      }
    ]

    const recoverOpenkey = this._params.Eth.recover(toRecover, paramsSignature)
    if (recoverOpenkey.toLowerCase() !== playerAddress.toLowerCase()) {
      throw new Error('Invalid signature')
    }

    this.channelId     = channelId
    this.playerAddress = playerAddress

    const bankrollerAddress = this._params.Eth.getAccount().address
    const bankrollerDeposit = playerDeposit * this._params.rules.depositX
    this.bankrollerDeposit  = bankrollerDeposit
    const openingBlock      = await this._params.Eth.getBlockNumber()

    // Args for open channel transaction
    const { n, e }             = this.Rsa.getNE()
    const playerDepositWei     = bet2dec(playerDeposit)
    const bankrollerDepositWei = bet2dec(bankrollerDeposit)
    this.playerDepositWei      = playerDepositWei
    this.bankrollerDepositWei  = bankrollerDepositWei

    const response = {
      channelId,
      playerAddress,
      playerDepositWei,
      bankrollerAddress,
      bankrollerDepositWei,
      openingBlock,
      gameData,
      n, e
    }

    // Args for open channel transaction
    const toSign: SolidityTypeValue[] = [
      { t: 'bytes32' , v: channelId            } ,
      { t: 'address' , v: playerAddress        } ,
      { t: 'address' , v: bankrollerAddress    } ,
      { t: 'uint'    , v: playerDepositWei     } ,
      { t: 'uint'    , v: bankrollerDepositWei } ,
      { t: 'uint'    , v: openingBlock         } ,
      { t: 'uint'    , v: gameData             } ,
      { t: 'bytes'   , v: n                    } ,
      { t: 'bytes'   , v: e                    }
    ]

    const signature = this._params.Eth.signHash(toSign)
    return { response, signature }
  }

  async checkOpenChannel(): Promise<any> {
    const bankrollerAddress = this._params.Eth.getAccount().address.toLowerCase()
    const channel = await this._params.payChannelContract.methods
      .channels(this.channelId)
      .call()

    if (
      channel.state === '1' &&
      channel.player.toLowerCase() === this._params.userId.toLowerCase() &&
      channel.bankroller.toLowerCase() ===
        this._params.Eth.getAccount().address.toLowerCase() &&
      '' + channel.playerBalance === '' + this.playerDepositWei &&
      '' + channel.bankrollerBalance === '' + this.bankrollerDepositWei
    ) {
      this.channel = channel

      // Устанавливаем депозит игры
      this.payChannelLogic._setDeposits(channel.playerBalance, channel.bankrollerBalance)

      // Создаем нулевой стейт
      this.channelState = new ChannelState(this._params.userId, this._params.Eth)
      this.channelState.saveState({
        _id: this.channelId,
        _playerBalance: this.payChannelLogic._getBalance().player,
        _bankrollerBalance: this.payChannelLogic._getBalance().bankroller,
        _totalBet: '0',
        _session: 0,
      }, bankrollerAddress)

      this.emit('info', {
        event: 'OpenChannel checked',
        data: {
          player: channel.player.toLowerCase(),
          bankroller: channel.bankroller.toLowerCase(),
          playerBalance: channel.playerBalance,
          bankrollerBalance: channel.bankrollerBalance,
        },
      })
      return channel
    } else {
      throw new Error('channel not found')
    }
  }

  async callPeerGame(params: { userBet: number; gameData: any }) {
    this.nonce++

    const { userBet, gameData } = params

    const seed = makeSeed()
    const userBetWei = bet2dec(userBet)
    const toSign: SolidityTypeValue[] = [
      { t: 'bytes32' , v: this.channelId } ,
      { t: 'uint'    , v: this.nonce     } ,
      { t: 'uint'    , v: userBetWei     } ,
      { t: 'uint'    , v: gameData       } ,
      { t: 'bytes32' , v: seed           }
    ]
    const sign = await this._params.Eth.signHash(toSign)

    try {
      // @TODO delete that
      await new Promise(resolve => setTimeout(resolve, 1000))
      const callResult = await this._peer.call({
        gameData,
        userBet,
        seed,
        nonce: this.nonce,
        sign,
      })
      const localResult = this._gameLogic.Game(
        userBet,
        gameData,
        callResult.randomHash
      )
      return callResult
    } catch (error) {
      logger.error(error)
      throw error
    }
  }
  async call(
    data: CallParams
  ): Promise<{
    signature: string
    randomHash: string
    gameLogicCallResult: any
  }> {
    if (!data || !data.gameData || !data.seed || !data.nonce) {
      throw new Error('Invalid arguments')
    }

    // сверяем номер сессии
    this.nonce++
    if (data.nonce * 1 !== this.nonce * 1) {
      throw new Error('Invalid nonce')
      // TODO: openDispute
    }

    // Инициализируем менеджер состояния канала для этого юзера если ещ нет
    if (!this.channelState) {
      this.channelState = new ChannelState(
        this._params.userId,
        this._params.Eth
      )
    }
    // Проверяем нет ли неподписанных юзером предыдущих состояний
    // if (this.channelState.hasUnconfirmed()) {
    //   throw new Error(
    //     "Player " + this._params.userId + " not confirm previous channel state"
    //   )
    // }

    // Проверяем что юзера достаточно бетов для этой ставки
    // let userBets = this.channel.playerBalance
    // const lastState = this.channelState.getBankrollerSigned()

    // if (lastState && lastState._playerBalance) {
    //   userBets = lastState._playerBalance
    // }

    // console.log(dec2bet(userBets), dec2bet(data.userBet))
    // if (dec2bet(userBets) < dec2bet(data.userBet) * 1) {
    //   throw new Error(
    //     "Player " + this._params.userId + " not enougth money for this bet"
    //   )
    // }
    const { userBet, gameData, seed } = data
    const userBetWei = bet2dec(userBet)
    // проверка подписи
    const toSign: SolidityTypeValue[] = [
      { t: 'bytes32' , v: this.channelId  } ,
      { t: 'uint'    , v: this.nonce      } ,
      { t: 'uint'    , v: userBetWei      } ,
      { t: 'uint'    , v: gameData as any } ,
      { t: 'bytes32' , v: seed            }
    ]
    const recoverOpenkey = this._params.Eth.recover(toSign, data.sign)

    if (recoverOpenkey.toLowerCase() !== this._params.userId.toLowerCase()) {
      throw new Error('Invalid signature')
    }

    // Подписываем данные и получаем изних рандом
    const { randomHash, signature } = this._getRandom(toSign)

    // Вызываем функцию игры
    let gameLogicCallResult
    try {
      gameLogicCallResult = this._gameLogic.Game(userBet, gameData, randomHash)
    } catch (error) {
      const errorData = {
        message: `Can't call gamelogic function with args`,
        data: [userBet, gameData, randomHash],
        error
      }
      throw new Error(JSON.stringify(errorData))
    }

    const stateData = {
      _id: this.channelId,
      _playerBalance: '' + this.payChannelLogic._getBalance().player,
      _bankrollerBalance: '' + this.payChannelLogic._getBalance().bankroller,
      _totalBet: '0',
      _nonce: this.nonce,
    }

    // Сохраняем подписанный нами последний стейт канала
    // if (!this.channelState.addBankrollerSigned(state_data)) {
    //   throw new Error(
    //     "Prodblem with save last channel state - addBankrollerSignedState"
    //   )
    // }
    return {
      randomHash,
      signature,
      gameLogicCallResult,
    }
  }
  _getRandom(
    data: SolidityTypeValue[]
  ): {
    signature: string
    randomHash: string
  } {
    const hash       = sha3(...data)
    const signature  = this.Rsa.sign(hash).toString()
    const randomHash = sha3(signature)

    return { signature, randomHash }
  }

  updateState(data: { state: any }): { status: string } {
    if (!this.channelState.addPlayerSigned(data.state)) {
      throw new Error('incorrect data')
    }
    return { status: 'ok' }
  }

  async closeChannel(): Promise<any> {
    logger.debug(this.channelState)
    const playerAddress = this._params.Eth.getAccount().address
    const lastState     = this.channelState.getState(playerAddress)
    const closeChannelData: SolidityTypeValue[] = [
      { t: 'bytes32', v: lastState._id                     },
      { t: 'uint256', v: '' + lastState._playerBalance     },
      { t: 'uint256', v: '' + lastState._bankrollerBalance },
      { t: 'uint256', v: '' + lastState._totalBet          },
      { t: 'uint256', v: '' + lastState._session                },
      { t: 'bool',    v: true                              }
    ]

    logger.debug(closeChannelData)

    const signLastState = this._params.Eth.signHash(closeChannelData)
    const { consentSignature, bankrollerAddress } = this._peer.consentCloseChannel(signLastState)

    const recoverOpenkey = this._params.Eth.recover(closeChannelData, consentSignature)
    if (recoverOpenkey.toLowerCase() !== bankrollerAddress.toLowerCase()) {
      throw new Error('Invalid signature')
    }

    try {
      const closeChannelArgs = [
        lastState._id,
        lastState._playerBalance,
        lastState._bankrollerBalance,
        lastState._totalBet,
        lastState._session,
        true,
        consentSignature
      ]

      const closeChannelTX = await this._params.Eth.sendTransaction(
        this._params.payChannelContract,
        'closeByConsent',
        closeChannelArgs
      )

      if (closeChannelTX.status) {
        return true
      }
    } catch (error) {
      throw error
    }
  }

  consentCloseChannel(signLastState: string): any {
    const bankrollerAddress = this._params.Eth.getAccount().address
    const lastState         = this.channelState.getState(bankrollerAddress)
    
    const consentData: SolidityTypeValue[] = [
      { t: 'bytes32', v: lastState._id                     },
      { t: 'uint',    v: '' + lastState._playerBalance     },
      { t: 'uint',    v: '' + lastState._bankrollerBalance },
      { t: 'uint',    v: '' + lastState._totalBet          },
      { t: 'uint',    v: lastState._session                },
      { t: 'bool',    v: true                              }
    ]

    logger.debug(`ssssss`,lastState)

    const recoverOpenkey = this._params.Eth.recover(consentData, signLastState)
    if (recoverOpenkey.toLowerCase() !== this.playerAddress.toLowerCase()) {
      throw new Error('Invalid signature')
    }

    const consentSignature  = this._params.Eth.signHash(consentData)
    return { consentSignature, bankrollerAddress }
  }

  async checkCloseChannel(data) {
    const channel = await this._params.payChannelContract.methods
      .channels(this.channelId)
      .call()
    if (channel.state === '2') {
      this.finish()
      return { status: 'ok' }
    } else {
      //
      // user.paychannel.closeByConsent
      // ???
    }
  }
  finish() {
    this._params.onFinish(this._params.userId)
  }

  reconnect(data) {
    logger.debug('User reconnect')
    // TODE implement or delete
  }
  disconnect() {
    this.finish()
    return { disconnected: true }
  }
}
