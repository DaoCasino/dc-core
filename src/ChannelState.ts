import { Eth, sha3 } from 'dc-ethereum-utils';

/*
 * Channel state manager / store
 */
import { Logger } from 'dc-logging';

const logger = new Logger('tests');

export class ChannelState {
  states: any;
  waitStates: any;
  stateFormat: any;
  playerOpenkey: any;
  private eth: Eth;
  constructor(playerOpenkey: string, eth: Eth) {
    this.eth = eth;
    if (!playerOpenkey) {
      logger.error(' player_openkey required in channelState constructor');
      return;
    }
    this.playerOpenkey = playerOpenkey;
  }
  checkFormat(data) {
    for (const k in this.stateFormat) {
      if (k !== '_sign' && !data[k]) return false;
    }
    return true;
  }

  GetState(hash?) {
    if (Object.keys(this.states).length === 0) return {};
    if (!hash) hash = Object.keys(this.states).splice(-1);
    return this.states[hash];
  }

  addBankrollerSigned(stateData) {
    if (!this.checkFormat(stateData)) {
      logger.error('Invalid channel state format in addBankrollerSigned');
      return false;
    }

    const stateHash = sha3(
      { t: 'bytes32', v: stateData._id },
      { t: 'uint', v: stateData._playerBalance },
      { t: 'uint', v: stateData._bankrollerBalance },
      { t: 'uint', v: stateData._totalBet },
      { t: 'uint', v: stateData._session }
    );
    const stateSign = this.eth.signHash(stateHash);

    if (!this.states[stateHash]) this.states[stateHash] = { confirmed: false };
    this.states[stateHash].bankroller = {
      ...stateData,
      _sign: stateSign
    };
    this.waitStates[stateHash] = stateData._session;
    return true;
  }

  addPlayerSigned(stateData) {
    if (!this.checkFormat(stateData)) {
      logger.error('Invalid channel state format in addPlayerSigned');
      return false;
    }

    const playerStateHash = sha3(
      { t: 'bytes32', v: stateData._id },
      { t: 'uint', v: stateData._playerBalance },
      { t: 'uint', v: stateData._bankrollerBalance },
      { t: 'uint', v: stateData._totalBet },
      { t: 'uint', v: stateData._session }
    );

    const state = this.GetState(playerStateHash);
    if (!state || !state.bankroller) {
      logger.error('State with hash ' + playerStateHash + ' not found');
      return false;
    }

    // Проверяем содержимое
    for (const k in state.bankroller) {
      if (k === '_sign') continue;
      if (state.bankroller[k] !== stateData[k]) {
        logger.error(
          'user channel state != last bankroller state',
          state,
          stateData
        );
        logger.error(state.bankroller[k] + '!==' + stateData[k]);
        return false;
      }
    }

    // Проверяем подпись
    const stateHash = sha3(
      { t: 'bytes32', v: state.bankroller._id },
      { t: 'uint', v: state.bankroller._playerBalance },
      { t: 'uint', v: state.bankroller._bankrollerBalance },
      { t: 'uint', v: state.bankroller._totalBet },
      { t: 'uint', v: state.bankroller._session }
    );

    if (stateHash !== playerStateHash) {
      logger.error(' state_hash!=player_state_hash ...');
      return false;
    }

    const recoverOpenkey = this.eth.recover(stateHash, stateData._sign);
    if (recoverOpenkey.toLowerCase() !== this.playerOpenkey.toLowerCase()) {
      logger.error('State ' + recoverOpenkey + '!=' + this.playerOpenkey);
      return false;
    }

    this.states[stateHash].player = { ...stateData };
    this.states[stateHash].confirmed = true;

    delete this.waitStates[stateHash];

    return true;
  }

  hasUnconfirmed() {
    return Object.keys(this.waitStates).length > 0;
  }

  get(hash) {
    return this.GetState(hash);
  }

  getPlayerSigned(hash?) {
    if (!hash) hash = Object.keys(this.states).splice(-1);
    return this.GetState(hash).player;
  }

  getBankrollerSigned(hash?) {
    if (!hash) hash = Object.keys(this.states).splice(-1);
    return this.GetState(hash).bankroller;
  }
}
