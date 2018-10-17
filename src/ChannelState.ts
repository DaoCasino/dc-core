import {
  Eth,
  sha3,
  SolidityTypeValue
} from 'dc-ethereum-utils'

import { Logger } from 'dc-logging'

const logger = new Logger('tests')
export class ChannelState {
  states: any
  waitStates: any
  stateFormat: any
  playerOpenkey: any
  private eth: Eth

  constructor(playerOpenkey: string, eth: Eth) {
    this.eth        = eth
    this.states     = {}
    this.waitStates = {}
    if (!playerOpenkey) {
      logger.error(' player_openkey required in channelState constructor')
      return
    }
    this.playerOpenkey = playerOpenkey
  }

  checkFormat(data) {
    for (const k in this.stateFormat) {
      if (k !== '_sign' && !data[k]) return false
    }
    return true
  }

  getState(address: string, hash?): any {
    if (Object.keys(this.states).length === 0) return {}
    if (!hash) hash = Object.keys(this.states).splice(-1)

    for (const key in this.states[hash]) {
      if (key.toLowerCase() === address.toLowerCase()) {
        logger.debug(this.states[hash][key])
        return this.states[hash][key]
      }
    }

    logger.debug(`Not state for address: ${address}`)
    return false
  }

  saveState(stateData: any, address: string): boolean {
    if (!this.checkFormat(stateData)) {
      logger.error('Invalid channel state format in addBankrollerSigned')
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
    const stateSign = this.eth.signHash(newState)

    this.states[stateHash] = (!this.states[stateHash]) && { confirmed: false }
    this.states[stateHash][address] = {
      ...stateData,
      _sign: stateSign,
    }

    this.waitStates[stateHash] = stateData._session
    return true
  }

  addPlayerSigned(stateData) {
    if (!this.checkFormat(stateData)) {
      logger.error('Invalid channel state format in addPlayerSigned')
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
    const state = this.getState(playerStateHash)
    if (!state || !state.bankroller) {
      logger.error('State with hash ' + playerStateHash + ' not found')
      return false
    }

    // Проверяем содержимое
    for (const k in state.bankroller) {
      if (k === '_sign') continue
      if (state.bankroller[k] !== stateData[k]) {
        logger.error(
          'user channel state != last bankroller state',
          state,
          stateData
        )
        logger.error(state.bankroller[k] + '!==' + stateData[k])
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
    const stateSign = this.eth.signHash(newStateData)
    if (stateHash !== playerStateHash) {
      logger.error(' state_hash!=player_state_hash ...')
      return false
    }

    const recoverOpenkey = this.eth.recover(newStateData, stateSign)
    if (recoverOpenkey.toLowerCase() !== this.playerOpenkey.toLowerCase()) {
      logger.error('State ' + recoverOpenkey + '!=' + this.playerOpenkey)
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

  get(hash) {
    return this.getState(hash)
  }

  // getPlayerSigned(hash?) {
  //   if (!hash) hash = Object.keys(this.states).splice(-1)
  //   return this.getState(hash).player
  // }

  // getBankrollerSigned(hash?) {
  //   if (!hash) hash = Object.keys(this.states).splice(-1)
  //   return this.getState(hash).bankroller
  // }
}
