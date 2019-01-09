import { IDApp, DAppParams, UserId, GameInfo } from "./interfaces/index"

import { config } from "@daocasino/dc-configs"

import { Logger } from "@daocasino/dc-logging"
import Contract from "web3/eth/contract"
import { setInterval } from "timers"
import { EventEmitter } from "events"
import { DAppPlayerInstance } from "./DAppPlayerInstance"
import { DAppDealerInstance } from "./DAppDealerInstance"
import * as Utils from "@daocasino/dc-ethereum-utils"

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
const SERVER_APPROVE_AMOUNT = 100000000
const SERVER_APPROVE_MINAMOUNT = 10000000

interface IGameInfoRoom {
  on: (event: "ready", callback: (info: ReadyInfo) => void) => void
  connect: ({ userId: string }) => { roomAddress: string }
}

export class DApp extends EventEmitter implements IDApp, IGameInfoRoom {
  private _params: DAppParams
  _instancesMap: Map<UserId, DAppDealerInstance>
  _gameContractInstance: Contract
  _gameContractAddress: string
  _gameInfo: GameInfo
  _beaconInterval: NodeJS.Timer
  _gameInfoRoom: IGameInfoRoom
  dappInstance: DAppPlayerInstance
  _dappInstancePromise: Promise<DAppPlayerInstance | null>
  _gameInfoRoomAddress: string

  constructor(params: DAppParams) {
    super()

    if (!params.slug) {
      log.debug(["Create DApp error", params], "error")
      throw new Error("slug option is required")
    }

    if (!params.gameContractAddress) {
      throw new Error("gameContract is not specified in  DApp params")
    }

    this._params = params
    this._instancesMap = new Map()

    const { gameContractAddress, slug } = this._params
    const gameId = slug

    this._gameInfo = {
      gameId,
      slug,
      hash: Utils.checksum(slug),
      contract: gameContractAddress
    }

    this._gameContractAddress = gameContractAddress
    this._gameContractInstance = this._params.Eth.initContract(
      config.default.contracts.Game.abi,
      gameContractAddress
    )

    this._gameInfoRoomAddress = `${params.platformId}_${
      params.blockchainNetwork
    }_${this._gameInfo.hash}`
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

  async startClient(): Promise<DAppPlayerInstance> {
    this._gameInfoRoom = await this._params.roomProvider.getRemoteInterface<
      IGameInfoRoom
    >(this._gameInfoRoomAddress)

    const readyServers: Map<string, ReadyInfo> = new Map()

    const prommise = new Promise<DAppPlayerInstance>((resolve, reject) => {
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
  ): Promise<DAppPlayerInstance | null> {
    const self = this
    if (this.dappInstance) return this.dappInstance
    const theChosen = Array.from(readyServers.values())
      .filter(readyServer => {
        return readyServer.deposit
      })
      .sort((a, b) => {
        return a.deposit - b.deposit[0]
      })
    // TODO: should be some more complicated alg

    if (theChosen) {
      const userId = this._params.Eth.getAccount().address
      const { roomAddress } = await this._gameInfoRoom.connect({
        userId
      })

      this.dappInstance = new DAppPlayerInstance({
        userId,
        num: 0,
        rules: this._params.rules,
        gameContractInstance: this._gameContractInstance,
        gameContractAddress: this._gameContractAddress,
        gameLogicFunction: this._params.gameLogicFunction,
        roomProvider: this._params.roomProvider,
        roomAddress,
        onFinish: this.onGameFinished,
        gameInfo: this._gameInfo,
        Eth: this._params.Eth
      })
      this.dappInstance.on("info", data => {
        self.emit("dapp::status", {
          message: "dapp instance message",
          data
        })
      })
      await this.dappInstance.start()

      return this.dappInstance
    }
    self.emit("dapp::status", { message: "Server not chosen", data: {} })
    log.debug("Server not choosen")
    return null
  }

  async startServer() {
    await this._params.roomProvider.exposeSevice(
      this._gameInfoRoomAddress,
      this,
      true
    )
    await this._params.Eth.ERC20ApproveSafe(
      this._gameContractAddress,
      SERVER_APPROVE_AMOUNT,
      SERVER_APPROVE_MINAMOUNT
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
      gameLogicFunction: this._params.gameLogicFunction,
      gameContractInstance: this._gameContractInstance,
      gameContractAddress: this._gameContractAddress,
      roomProvider: this._params.roomProvider,
      onFinish: this.onGameFinished,
      gameInfo: this._gameInfo,
      Eth: this._params.Eth,
      statistics: this._params.statisticsClient
    })
    dappInstance.start()
    // TODO remove circular dependency

    this._instancesMap.set(userId, dappInstance)
    log.debug(`User ${userId} connected to  ${this._params.slug}`)
    return { roomAddress }
  }
}
