import * as Utils from 'dc-ethereum-utils';
import { Logger } from 'dc-logging';
import { IPayChannelLogic } from './interfaces/index';
/** max items in history */
const MAX_HISTORY_ITEMS = 100;

const logger = new Logger('PayChannelLogic');

export class PayChannelLogic implements IPayChannelLogic {
  deposit: {
    player: number | null;
    bankroller: number | null;
  };
  balance: {
    player: number;
    bankroller: number;
  };
  private _profit = 0;
  private _history = [];
  constructor() {
    this.deposit = {
      player: null,
      bankroller: null
    };
    this.balance = {
      player: 0,
      bankroller: 0
    };
    this._profit = 0;
    this._history = [];
  }

  _setDeposits(player, bankroller) {
    if (this.deposit.player !== null) {
      console.warn('Deposit allready set');
    }

    this.deposit.player = +player;
    this.deposit.bankroller = +bankroller;
    this.balance.player = 1 * this.deposit.player;
    this.balance.bankroller = 1 * this.deposit.bankroller;

    return this.balance;
  }

  _getBalance() {
    return this.balance;
  }

  _getProfit() {
    return this._profit;
  }

  getDeposit() {
    return Utils.dec2bet(this.deposit.player);
  }

  getBalance() {
    return Utils.dec2bet(this.balance.player);
  }

  getBankrollBalance() {
    return Utils.dec2bet(this.balance.bankroller);
  }

  getProfit() {
    return Utils.dec2bet(this._profit);
  }

  updateBalance(p) {
    return this.addTX(p);
  }

  addTX(profit: number) {
    this._profit += profit * 1;
    this.balance.player = this.deposit.player + this._profit;
    this.balance.bankroller = this.deposit.bankroller - this._profit;

    this._history.push({
      profit: profit,
      balance: this.balance.player,
      timestamp: new Date().getTime()
    });

    this._history = this._history.splice(-MAX_HISTORY_ITEMS);

    return this._profit;
  }
  getView() {
    return {
      deposit: this.getDeposit(),
      playerBalance: this.getBalance(),
      bankrollerBalance: this.getBankrollBalance(),
      profit: this.getProfit()
    };
  }
  printLog() {
    logger.debug('Paychannel state:');
    logger.debug({
      Deposit: this.getDeposit(),
      Player_balance: this.getBalance(),
      Bankroll_balance: this.getBankrollBalance(),
      Profit: this.getProfit()
    });
    logger.debug(
      'TX History, last ' + MAX_HISTORY_ITEMS + ' items ' + this._history.length
    );
    logger.debug(this._history);

    return this._history;
  }

  reset() {
    logger.debug('PayChannel::reset, set deposit balance profit to 0');
    this.deposit.player = null;
    this.deposit.bankroller = null;
    this.balance.player = 0;
    this.balance.bankroller = 0;
    this._profit = 0;
    this._history.push({ reset: true, timestamp: new Date().getTime() });
  }
}
