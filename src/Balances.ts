import * as Utils from 'dc-ethereum-utils'
import { Logger } from 'dc-logging'
import { IBalances } from './interfaces/index'
/** max items in history */
const MAX_HISTORY_ITEMS = 100

const log = new Logger('Balances')

export class Balances implements IBalances {
  deposit: {
    player: number | null
    bankroller: number | null
  }
  balance: {
    player: number
    bankroller: number
  }
  private _profit = 0
  private _history = []
  constructor() {
    this.deposit = {
      player: null,
      bankroller: null,
    }
    this.balance = {
      player: 0,
      bankroller: 0,
    }
    this._profit = 0
    this._history = []
  }

  _setDeposits(player, bankroller) {
    if (this.deposit.player !== null) {
      log.warn('Deposit allready set')
    }

    this.deposit.player = +player
    this.deposit.bankroller = +bankroller
    this.balance.player = 1 * this.deposit.player
    this.balance.bankroller = 1 * this.deposit.bankroller

    return this.balance
  }


  _addTX(profit: number) {
    this._profit += Utils.bet2dec(profit)
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

  getBalances() {
    return {
      deposits:{
        player: Utils.bet2dec(this.deposit.player),
        bankroller: Utils.bet2dec(this.deposit.player)
      },
      balance:{
        player: Utils.bet2dec(this.balance.player),
        bankroller: Utils.bet2dec(this.balance.player)
      },
      profit:{
        player: Utils.bet2dec(this._profit),
        bankroller: Utils.bet2dec(-this._profit)
      }
    }
  }

  printLog() {
    log.debug('Paychannel state:')
    log.debug(this.getBalances())
    log.debug(
      'TX History, last ' + MAX_HISTORY_ITEMS + ' items ' + this._history.length
    )
    log.debug(this._history)

    return this._history
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
