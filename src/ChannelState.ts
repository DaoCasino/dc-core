import { Eth, sha3, SolidityTypeValue } from "dc-ethereum-utils"

import { Logger } from "dc-logging"
const log = new Logger("tests")


export interface State {
  data: {
    _id: string
    _playerBalance: number,
    _bankrollerBalance: number,
    _totalBet:number,
    _session: number
  }
  hash:string // sha3 hash of SolidityTypeValue data
  signs:{}
}

export class ChannelState {
  private _id: string // channel id
  private Eth: Eth
  private _session: number = 0 // aka nonce
  private _totalBet = 0
  private _profit = 0

  owner:string // instance owner

  state: State

  playerOpenkey: string
  bankrollerOpenkey: string

  deposit: {
    player: number | null
    bankroller: number | null
  }
  balance: {
    player: number
    bankroller: number
  }

  constructor(
    eth: Eth,
    channelId: string,
    playerOpenkey: string,
    bankrollerOpenkey: string,
    playerDeposit: number,
    bankrollerDeposit: number,
    owner:string
  ) {
    this.owner = owner
    this._id = channelId
    this.Eth = eth

    this.deposit = {
      player: null,
      bankroller: null
    }
    this.balance = {
      player: 0,
      bankroller: 0
    }
    this._profit = 0

    if (!playerOpenkey) {
      log.error(" player_openkey required in channelState constructor")
      return
    }
    this.playerOpenkey = playerOpenkey
    this.bankrollerOpenkey = bankrollerOpenkey

    // set deposits
    this.deposit.player = +playerDeposit
    this.deposit.bankroller = +playerDeposit
    this.balance.player = 1 * this.deposit.player
    this.balance.bankroller = 1 * this.deposit.bankroller

    this.state= {
      hash:'',
      signs:{},
      data:{
        _id: this._id,
        _playerBalance: this.balance.player,
        _bankrollerBalance: this.balance.bankroller,
        _totalBet: this._totalBet,
        _session: this._session
      }
    }
  }

  _addTotalBet(userBet: number) {
    this._totalBet += userBet
  }

  _addTX(profit: number) {
    this._profit += profit
    this.balance.player = this.deposit.player + this._profit
    this.balance.bankroller = this.deposit.bankroller - this._profit

    return this._profit
  }

  getData() {
    return {
      deposits: {
        player: this.deposit.player,
        bankroller: this.deposit.player
      },
      balance: {
        player: this.balance.player,
        bankroller: this.balance.player
      },
      profit: {
        player: this._profit,
        bankroller: -this._profit
      }
    }
  }

  getSession() {
    return this._session
  }


  _sha3state(stateData:State['data']){
    const toHash: SolidityTypeValue[] = [
      { t: "bytes32", v: stateData._id },
      { t: "uint256", v: "" + stateData._playerBalance },
      { t: "uint256", v: "" + stateData._bankrollerBalance },
      { t: "uint256", v: "" + stateData._totalBet },
      { t: "uint256", v: "" + stateData._session }
    ]

    return sha3(...toHash)
  }

  ourStateData():State['data']{
    return {
      _id: this._id,
      _playerBalance: this.balance.player,
      _bankrollerBalance: this.balance.bankroller,
      _totalBet: this._totalBet,
      _session: this._session
    }
  }

  createState(bet:number, profit:number):State{
    // Change balances on channel state
    this._addTotalBet(bet)
    this._addTX(profit)

    const ourAddr   = this.Eth.getAccount().address
    const stateData = this.ourStateData()
    const stateHash = this._sha3state(stateData)
    const stateSign = this.Eth.signHash(stateHash)

    this._session++

    this.state = {
      data  : stateData,
      hash  : stateHash,
      signs : {
        [ourAddr] : stateSign
      }
    }

    return this.state
  }

  getState():State['data'] {
    return this.state.data
  }

  hasUnconfirmed(address:string) {
    if (this._session < 2) {
      return false
    }

    const addrSign = this.state.signs[address]
    if (!addrSign) {
      return true
    }

    const recoverOpenkey = this.Eth.recover(this.state.hash, addrSign)
    
    if (recoverOpenkey.toLowerCase() !== address.toLowerCase()) {
      return true
    }

    return false
  }

  confirmState(theirState:State, address:string){
    const theirHash = this._sha3state(theirState.data)
    
    if (this.state.hash !== theirHash) {
      log.error(' this.state.hash !== theirHash ...')
      return false
    }

    const theirSign = theirState.signs[address]
    const recoverOpenkey = this.Eth.recover(this.state.hash, theirSign)
    
    if (recoverOpenkey.toLowerCase() !== address.toLowerCase()) {
      log.error('State ' + recoverOpenkey + '!=' + address)
      return false
    }

    this.state.signs[address] = ''+theirState.signs[address]
    return true
  }


  reset() {
    log.debug("PayChannel::reset, set deposit balance profit to 0")
    this.deposit.player = null
    this.deposit.bankroller = null
    this.balance.player = 0
    this.balance.bankroller = 0
    this._profit = 0
  }
}
