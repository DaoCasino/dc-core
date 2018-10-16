import {
  IDApp,
  DAppParams,
  UserId,
  GameInfo
} from "./interfaces/index"

import { Logger } from "dc-logging"
import { config } from "dc-configs"
import Contract from "web3/eth/contract"
import { setInterval } from "timers"
import { DAppInstance } from "./DAppInstance"
import { EventEmitter } from "events"
import DAppPeerInstance from './DAppPeerInstance'
import DAppDealerInstance from './DAppDealeInstance'
import * as Utils from "dc-ethereum-utils"


const log = new Logger("DAppInstance")

/*
 * DApp constructor
 */

interface ReadyInfo {
  deposit: number // bets * 100000000,
  dapp: {
    slug: string
    hash: string
  }
  address: string
}

interface IGameInfoRoom {
  on: (event: "ready", callback: (info: ReadyInfo) => void) => void
  connect: ({ userId: string }) => { roomAddress: string }
}

export class DApp extends EventEmitter implements IDApp, IGameInfoRoom {
  private _params: DAppParams
  _instancesMap: Map<UserId, DAppDealerInstance>
  _payChannelContract: Contract
  _payChannelContractAddress: string
  _gameInfo: GameInfo
  _beaconInterval: NodeJS.Timer
  _gameInfoRoom: IGameInfoRoom
  dappInstance: DAppPeerInstance
  _dappInstancePromise: Promise<DAppPeerInstance | null>
  _gameInfoRoomAddress: string

  constructor(params: DAppParams) {
    super()

    if (!params.slug) {
      log.debug(["Create DApp error", params], "error")
      throw new Error("slug option is required")
    }
    
    if (!params.contract) {
      throw new Error("Contract is not specified in  DApp params")
    }
    
    this._params = params
    this._instancesMap = new Map()
    
    const { contract, slug } = this._params
    const gameId = slug

    this._gameInfo = {
      gameId,
      slug,
      hash: Utils.checksum(slug),
      contract
    }
    
    this._payChannelContract = this._params.Eth.initContract(
      contract.abi,
      contract.address
    )
    
    this._payChannelContractAddress = contract.address
    this._gameInfoRoomAddress = `${params.platformId}_${this._gameInfo.hash}`
  }

  getView() {
    return { name: this._params.slug }
  }

  getInstancesView() {
    return Array.from(this._instancesMap.values()).map(instance =>
      instance.getView()
    )
  }

  eventNames(): string[] {
    return ["ready"]
  }

  async startClient(): Promise<DAppPeerInstance> {
    this._gameInfoRoom = await this._params.roomProvider.getRemoteInterface<
      IGameInfoRoom
    >(this._gameInfoRoomAddress)

    const readyServers: Map<string, ReadyInfo> = new Map()

    const prommise = new Promise<DAppPeerInstance>((resolve, reject) => {
      this._gameInfoRoom.on("ready", async readyInfo => {
        readyServers.set(readyInfo.address, readyInfo)

        if (this._dappInstancePromise) await this._dappInstancePromise
        
        this._dappInstancePromise = this._chooseServer(readyServers)
        const result = await this._dappInstancePromise
        
        if (result) {
          resolve(result)
        }
      })
    })

    return prommise
  }

  async _chooseServer(
    readyServers: Map<string, ReadyInfo>
  ): Promise<DAppPeerInstance | null> {
    if (this.dappInstance) return this.dappInstance

    const theChosen = Array.from(readyServers.values())
      .filter(readyServer => readyServer.deposit)
      .sort((a, b) => a.deposit - b.deposit)[0]

    // TODO: should be some more complicated alg
    
    if (theChosen) {
      const userId = this._params.Eth.getAccount().address
      const { roomAddress } = await this._gameInfoRoom.connect({
        userId
      })

      this.dappInstance = new DAppPeerInstance({
        userId,
        num: 0,
        rules: this._params.rules,
        payChannelContract: this._payChannelContract,
        payChannelContractAddress: this._payChannelContractAddress,
        gameLogicFunction: this._params.gameLogicFunction,
        roomProvider: this._params.roomProvider,
        roomAddress,
        onFinish: this.onGameFinished,
        gameInfo: this._gameInfo,
        Eth: this._params.Eth
      })
      
      await this.dappInstance.startClient()
      return this.dappInstance
    }

    log.debug("Server not chosen")
    return null
  }

  async startServer() {
    await this._params.roomProvider.exposeSevice(
      this._gameInfoRoomAddress,
      this,
      true
    )
    return this._startSendingBeacon(3000)
  }

  async _startSendingBeacon(timeOut) {
    const { balance } = await this._params.Eth.getBetBalance(
      this._params.Eth.getAccount().address
    )
    const self = this

    this._beaconInterval = setInterval(() => {
      self.emit("ready", {
        // deposit: bet2dec(balance),
        deposit: balance,
        dapp: {
          slug: self._params.slug,
          hash: self._gameInfo.hash
        },
        address: this._params.Eth.getAccount().address.toLowerCase()
      })
    }, timeOut)
  }

  // User connect
  onGameFinished(userId: UserId) {
    this._instancesMap.delete(userId)
  }

  connect(params: { userId: string }) {
    const roomAddress = Utils.makeSeed()
    const { userId } = params
    const account = this._params.Eth.getAccount()

    const dappInstance = new DAppDealerInstance({
      userId,
      num: 0,
      rules: this._params.rules,
      roomAddress,
      payChannelContract: this._payChannelContract,
      payChannelContractAddress: this._payChannelContractAddress,
      gameLogicFunction: this._params.gameLogicFunction,
      roomProvider: this._params.roomProvider,
      onFinish: this.onGameFinished,
      gameInfo: this._gameInfo,
      Eth: this._params.Eth
    })
    dappInstance.startServer()
    // TODO remove circular dependency

    this._instancesMap.set(userId, dappInstance)
    log.debug(`User ${userId} connected to  ${this._params.slug}`)
    return { roomAddress }
  }
}
