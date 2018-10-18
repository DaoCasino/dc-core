import {
  Eth,
  sha3,
  SolidityTypeValue
} from 'dc-ethereum-utils'

import { Logger } from 'dc-logging'
const log = new Logger('tests')

const MAX_HISTORY_ITEMS = 99

export class ChannelState {
  private _id:string // channel id
  private Eth: Eth
  private _totalBet = 0
  private _profit = 0
  private _history = []

  states: any
  waitStates: any
  stateFormat: any
  playerOpenkey: any

  deposit: {
    player     : number | null
    bankroller : number | null
  }
  balance: {
    player     : number
    bankroller : number
  }

  constructor(
    eth: Eth,
    channelId:string, 
    playerOpenkey:string, 
    playerDeposit:number, 
    bankrollerDeposit:number 
  ) {
    this._id        = channelId
    this.Eth        = eth
    this.states     = {}
    this.waitStates = {}
    
    this.deposit = {
      player     : null,
      bankroller : null
    }
    this.balance = {
      player     : 0,
      bankroller : 0
    }
    this._profit  = 0
    this._history = []

    if (!playerOpenkey) {
      log.error(' player_openkey required in channelState constructor')
      return
    }
    this.playerOpenkey = playerOpenkey

    // set deposits
    this.deposit.player     = +playerDeposit
    this.deposit.bankroller = +playerDeposit
    this.balance.player     = 1 * this.deposit.player
    this.balance.bankroller = 1 * this.deposit.bankroller
  }

  _addTotalBet(userBet:number){
    this._totalBet += userBet
  }

  _addTX(profit:number) {
    this._profit += profit
    this.balance.player = this.deposit.player + this._profit
    this.balance.bankroller = this.deposit.bankroller - this._profit

    this._history.push({
      profit,
      balance: this.balance.player,
      timestamp: new Date().getTime(),
    })

    this._history = this._history.splice(-MAX_HISTORY_ITEMS)

    return this._profit
  }

  getData() {
    return {
      deposits:{
        player     : this.deposit.player,
        bankroller : this.deposit.player
      },
      balance:{
        player     : this.balance.player,
        bankroller : this.balance.player
      },
      profit:{
        player     : this._profit,
        bankroller : -this._profit
      }
    }
  }

  checkFormat(data) {
    for (const k in this.stateFormat) {
      if (k !== '_sign' && !data[k]) return false
    }
    return true
  }

  saveState(session: number, address: string): boolean {
    const stateData = {
      '_id'                : this._id,
      '_playerBalance'     : '' + this.balance.player,
      '_bankrollerBalance' : '' + this.balance.bankroller,
      '_totalBet'          : '' + this._totalBet,
      '_session'           : session
    }

    if (!this.checkFormat(stateData)) {
      log.error('Invalid channel state format in addBankrollerSigned')
      return false
    }

    const newState: SolidityTypeValue[] = [
      { t: 'bytes32', v: stateData._id },
      { t: 'uint256', v: '' + stateData._playerBalance },
      { t: 'uint256', v: '' + stateData._bankrollerBalance },
      { t: 'uint256', v: '' + stateData._totalBet },
      { t: 'uint256', v: '' + stateData._session }
    ]
    
    const stateHash = sha3(...newState)
    const stateSign = this.Eth.signHash(newState)


    this.states[stateHash] = (!this.states[stateHash]) && { confirmed: false }
    this.states[stateHash][address] = {
      ...stateData,
      _sign: stateSign,
    }

    this.waitStates[stateHash] = session
    return this.states[stateHash][address]
  }

  getState(address: string, hash?): any {
    if (Object.keys(this.states).length === 0) return {}
    if (!hash) hash = Object.keys(this.states).splice(-1)

    for (const key in this.states[hash]) {
      if (key.toLowerCase() === address.toLowerCase()) {
        log.debug(this.states[hash][key])
        return this.states[hash][key]
      }
    }

    log.debug(`Not state for address: ${address}`)
    return false
  }

  addPlayerSigned(stateData) {
    if (!this.checkFormat(stateData)) {
      log.error('Invalid channel state format in addPlayerSigned')
      return false
    }

    const playerStateData: SolidityTypeValue[] = [
      { t: 'bytes32', v: stateData._id                     },
      { t: 'uint256', v: '' + stateData._playerBalance     },
      { t: 'uint256', v: '' + stateData._bankrollerBalance },
      { t: 'uint256', v: '' + stateData._totalBet          },
      { t: 'uint256', v: '' + stateData._session           }
    ]

    const playerStateHash = sha3(...playerStateData)
    const state = this.getState(this.playerOpenkey, playerStateHash)
    if (!state || !state.bankroller) {
      log.error('State with hash ' + playerStateHash + ' not found')
      return false
    }

    // Проверяем содержимое
    for (const k in state.bankroller) {
      if (k === '_sign') continue
      if (state.bankroller[k] !== stateData[k]) {
        log.error(
          'user channel state != last bankroller state',
          state,
          stateData
        )
        log.error(state.bankroller[k] + '!==' + stateData[k])
        return false
      }
    }

    // Проверяем подпись
    const newStateData: SolidityTypeValue[] = [
      { t: 'bytes32', v: state.bankroller._id                     },
      { t: 'uint256', v: '' + state.bankroller._playerBalance     },
      { t: 'uint256', v: '' + state.bankroller._bankrollerBalance },
      { t: 'uint256', v: '' + state.bankroller._totalBet          },
      { t: 'uint256', v: '' + state.bankroller._session           }
    ]

    const stateHash = sha3(...newStateData)
    const stateSign = this.Eth.signHash(newStateData)
    if (stateHash !== playerStateHash) {
      log.error(' state_hash!=player_state_hash ...')
      return false
    }

    const recoverOpenkey = this.Eth.recover(newStateData, stateSign)
    if (recoverOpenkey.toLowerCase() !== this.playerOpenkey.toLowerCase()) {
      log.error('State ' + recoverOpenkey + '!=' + this.playerOpenkey)
      return false
    }

    this.states[stateHash].player = { ...newStateData }
    this.states[stateHash].confirmed = true

    delete this.waitStates[stateHash]
    return true
  }

  hasUnconfirmed() {
    return Object.keys(this.waitStates).length > 0
  }

  getPlayerSigned(hash?) {
    if (!hash) hash = Object.keys(this.states).splice(-1)
    return this.getState(this.playerOpenkey, hash)
  }


  reset() {
    log.debug('PayChannel::reset, set deposit balance profit to 0')
    this.deposit.player = null
    this.deposit.bankroller = null
    this.balance.player = 0
    this.balance.bankroller = 0
    this._profit = 0
    this._history.push({ reset: true, timestamp: new Date().getTime() })
  }
}
