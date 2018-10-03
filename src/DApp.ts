import { Eth } from "dc-ethereum-utils";
import * as Utils from "dc-ethereum-utils";
import { IDApp, DAppParams, UserId, GameInfo } from "./interfaces/index";
import { DAppInstance } from "./DAppInstance";
import { setInterval } from "timers";
import { Logger } from "dc-logging";
import { config } from "dc-configs";
import { EventEmitter } from "events";

import Contract from "web3/eth/contract";

const logger = new Logger("DAppInstance");

/*
 * DApp constructor
 */
const SERVER_APPROVE_AMOUNT = 100000000;

interface ReadyInfo {
  deposit: number; // bets * 100000000,
  dapp: {
    slug: string;
    hash: string;
  };
  address: string;
}

interface IGameInfoRoom {
  on: (event: "ready", callback: (info: ReadyInfo) => void) => void;
  connect: ({ userId: string }) => { roomAddress: string };
}

export class DApp extends EventEmitter implements IDApp, IGameInfoRoom {
  private _params: DAppParams;
  _instancesMap: Map<UserId, DAppInstance>;
  _payChannelContract: Contract;
  _payChannelContractAddress: string;
  _gameInfo: GameInfo;
  _beaconInterval: NodeJS.Timer;
  _gameInfoRoom: IGameInfoRoom;
  dappInstance: DAppInstance;
  constructor(params: DAppParams) {
    super();
    const { slug, contract } = params;
    if (!slug) {
      Utils.debugLog(["Create DApp error", params], "error");
      throw new Error("slug option is required");
    }
    if (!contract) {
      throw new Error("Contract is not specified in  DApp params");
    }
    this._instancesMap = new Map();
    const gameId =
      !process.env.DC_NETWORK || process.env.DC_NETWORK !== "local"
        ? slug
        : `${slug}_dev`;

    this._gameInfo = {
      gameId,
      slug,
      hash: Utils.checksum(slug),
      contract: params.contract
    };
    this._params = params;
    this._payChannelContract = this._params.Eth.getContract(
      contract.abi,
      contract.address
    );
    this._payChannelContractAddress = contract.address;
  }
  getView() {
    return { name: this._params.slug };
  }

  getInstancesView() {
    return Array.from(this._instancesMap.values()).map(instance =>
      instance.getView()
    );
  }
  eventNames(): string[] {
    return ["ready"];
  }

  async startClient(): Promise<DAppInstance> {
    this._gameInfoRoom = await this._params.roomProvider.getRemoteInterface<
      IGameInfoRoom
    >(`dapp_room${this._gameInfo.hash}`);
    const readyServers: Map<string, ReadyInfo> = new Map();
    const self = this;
    let dappInstance;
    const promise = new Promise<DAppInstance>((resolve, reject) => {
      this._gameInfoRoom.on("ready", readyInfo => {
        readyServers.set(readyInfo.address, readyInfo);
        self._chooseServer(readyServers).then(result => {
          if (result) {
            dappInstance = result;
            resolve(result);
          }
        });
      });
    });
    return promise;
  }
  async _chooseServer(
    readyServers: Map<string, ReadyInfo>
  ): Promise<DAppInstance | null> {
    if (this.dappInstance) return this.dappInstance;
    const theChosen = Array.from(readyServers.values())
      .filter(readyServer => readyServer.deposit)
      .sort((a, b) => a.deposit - b.deposit)[0];
    //TODO should be some more comlicated alg
    if (theChosen) {
      const userId = this._params.contract.address;
      const { roomAddress } = await this._gameInfoRoom.connect({
        userId: this._params.Eth.account().address
      });
      this.dappInstance = new DAppInstance({
        userId,
        num: 0,
        rules: config.rules,
        payChannelContract: this._payChannelContract,
        payChannelContractAddress: this._payChannelContractAddress,
        gameLogicFunction: this._params.gameLogicFunction,
        roomProvider: this._params.roomProvider,
        roomAddress,
        onFinish: this.onGameFinished,
        gameInfo: this._gameInfo,
        Eth: this._params.Eth
      });
      return this.dappInstance;
      //     dappInstance.openChannel({
      //       channelId: string;
      // playerAddress: this._params.contract.address;
      // playerDeposit: number;
      // gameData: any;
      //     })
    }
    logger.debug("Server not chosen");
    return null;
  }
  async startServer() {
    await this._params.roomProvider.exposeSevice(
      `dapp_room${this._gameInfo.hash}`,
      this,
      true
    );
    await this._params.Eth.ERC20ApproveSafe(
      this._params.contract.address,
      SERVER_APPROVE_AMOUNT
    );

    return this._startSendingBeacon(3000);
  }

  async _startSendingBeacon(timeOut) {
    let log_beacon = 0;
    // Utils.debugLog('this._params.Eth.getBetBalance')
    const { balance } = await this._params.Eth.getBetBalance(
      this._params.Eth.account().address
    );
    const self = this;

    this._beaconInterval = setInterval(() => {
      self.emit("ready", {
        deposit: Utils.bet2dec(balance), // bets * 100000000,
        dapp: {
          slug: self._params.slug,
          hash: self._gameInfo.hash
        },
        address: this._params.Eth.account().address.toLowerCase()
      });
    }, timeOut);
  }

  // User connect
  onGameFinished(userId: UserId) {
    this._instancesMap.delete(userId);
  }

  connect(params: { userId: string }) {
    const roomAddress = Utils.makeSeed();
    const { userId } = params;
    const account = this._params.Eth.account();
    const dappInstance = new DAppInstance({
      userId,
      num: 0,
      rules: config.rules,
      roomAddress,
      payChannelContract: this._payChannelContract,
      payChannelContractAddress: this._payChannelContractAddress,
      gameLogicFunction: this._params.gameLogicFunction,
      roomProvider: this._params.roomProvider,
      onFinish: this.onGameFinished,
      gameInfo: this._gameInfo,
      Eth: this._params.Eth
    });
    dappInstance.startServer();
    //TODO remove circular dependency

    this._instancesMap.set(userId, dappInstance);
    logger.debug(`User ${userId} connected to  ${this._params.slug}`);
    return { roomAddress };
  }
}
