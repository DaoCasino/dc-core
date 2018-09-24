import {
  IDAppInstance,
  OpenChannelParams,
  SignedResponse,
  OpenChannelData,
  DAppInstanceParams,
  SolidityTypeValue,
  IRsa,
  Rsa,
  CallParams
} from "./interfaces/index";
import { PayChannelLogic } from "./PayChannelLogic";
import { ChannelState } from "./ChannelState";
import { sha3, debugLog, dec2bet, makeSeed } from "dc-ethereum-utils";
import { Logger } from "dc-logging";
import { config } from "dc-configs";

const logger = new Logger("DAppInstance");
const MINIMUM_ETH = 0.001;
const GAS_LIMIT = 4600000;
const GAS_PRICE = 40 * 1000000000;

export class DAppInstance implements IDAppInstance {
  private _peer: IDAppInstance;

  _params: DAppInstanceParams;
  Rsa: IRsa;
  _peerRsa: IRsa;
  channelId: string;
  playerAddress: string;
  playerDeposit: number;
  bankrollerDeposit: number;
  channel: any;
  payChannelLogic: PayChannelLogic;
  nonce: number;
  channelState: ChannelState;
  closeByConsentData: any;

  constructor(params: DAppInstanceParams) {
    this._params = params;
    this.nonce = 0;
    this.Rsa = new Rsa();
    const roomAddress = `${params.gameInfo.hash}_${this._params.userId}`;
    this._params.roomProvider.exposeSevice(roomAddress, this);
    this.payChannelLogic = new PayChannelLogic();
    //TODO rempve fropm global
  }
  getView() {
    return {
      ...this.payChannelLogic.getView(),
      playerAddress: this.playerAddress
    };
  }
  emit(event: string, data: any) {}

  async openChannel(params: OpenChannelParams) {
    const { playerDeposit, gameData } = params;
    if (!this._peer) {
      this._peer = await this._params.roomProvider.getRemoteInterface<
        IDAppInstance
      >(`${this._params.gameInfo.hash}_${this._params.userId}`);
    }
    logger.debug(`🔐 Open channel with deposit: ${playerDeposit}`);
    const userBalance = await this._params.Eth.getBalances();

    const mineth = 0.01;
    if (userBalance.eth.balance < MINIMUM_ETH) {
      throw new Error(
        `Not enough ETH to open channel: ${
          userBalance.eth.balance
        }. Need ${MINIMUM_ETH}`
      );
    }
    if (userBalance.bet.balance < playerDeposit) {
      throw new Error(
        `Not enough BET: ${
          userBalance.bet.balance
        } to open channel for: ${playerDeposit}`
      );
    }
    await this._params.Eth.ERC20ApproveSafe(
      this._params.payChannelContract.address,
      playerDeposit
    );
    const args = {
      channelId: makeSeed(),
      playerAddress: this._params.Eth.account().openkey,
      playerDeposit,
      gameData
    };
    const {
      response: peerResponse,
      signature
    } = await this._peer.getOpenChannelData(args);
    const {
      bankrollerDeposit,
      bankrollerAddress,
      playerAddress,
      openingBlock,
      n,
      e
    } = peerResponse;
    if (this._params.rules.depositX * args.playerDeposit > bankrollerDeposit) {
      logger.debug({
        msg: "Bankroller open channel bad deposit",
        data: {
          b_deposit: bankrollerDeposit,
          p_deposit: playerDeposit,
          depositX: this._params.rules.depositX
        }
      });
      throw new Error("Bankroller open channel deposit too low");
    }
    this._peerRsa = new Rsa({ n, e });
    // TODOc Проверяем возвращаемые банкроллером аргументы путем валидации хеша

    // проверяем апрув банкроллера перед открытием
    const bankrollerAllowance = await this._params.Eth.allowance(
      bankrollerAddress
    );
    if (bankrollerAllowance < bankrollerDeposit) {
      throw new Error(
        `Bankroller allowance too low ${bankrollerAllowance} for deposit ${bankrollerDeposit}`
      );
    }

    // проверяем что вообще есть БЭТы у банкроллера и их достаточно
    const bankrollerBallance = await this._params.Eth.getBetBalance(
      bankrollerAddress
    );
    if (bankrollerBallance < bankrollerDeposit) {
      throw new Error(
        `Bankroller balance too low ${bankrollerAllowance} for deposit ${bankrollerDeposit}`
      );
    }

    // Send open channel TX
    let check_open_channel_send = false;

    const openChannelPromise = this._params.payChannelContract.methods
      .openChannel(
        peerResponse.channelId,
        playerAddress,
        bankrollerAddress,
        playerDeposit,
        bankrollerDeposit,
        openingBlock,
        gameData,
        n,
        e,
        signature
      )
      .send({
        gas: GAS_LIMIT,
        gasPrice: GAS_PRICE,
        from: playerAddress
      });

    openChannelPromise.on("transactionHash", transactionHash => {
      logger.info("Open channel", transactionHash);
      this.emit("info", {
        msg: "Open channel transactionHash",
        data: { transactionHash }
      });
    });
    return new Promise((resolve, reject) => {
      openChannelPromise
        .on("confirmation", async confirmationNumber => {
          if (confirmationNumber <= config.waitForConfirmations) {
            console.log("open channel confirmationNumber", confirmationNumber);
          }
          if (confirmationNumber >= config.waitForConfirmations) {
            try {
              openChannelPromise.off("confirmation");

              const check = await this._peer.checkOpenChannel();
              this.payChannelLogic._setDeposits(
                playerDeposit,
                bankrollerDeposit
              );

              this.emit("info", {
                msg: "Channel is succefully open",
                data: {}
              });
              resolve({ ...check, ...args });
            } catch (error) {
              reject(error);
            }
          }
        })
        .on("error", error => {
          reject(error);
        });
    });
  }
  async getOpenChannelData(
    params: OpenChannelParams
  ): Promise<SignedResponse<OpenChannelData>> {
    // Create RSA keys for user

    const { channelId, playerAddress, playerDeposit, gameData } = params;
    this.channelId = channelId;
    this.playerAddress = playerAddress;
    this.playerDeposit = playerDeposit;
    const bankrollerAddress = this._params.Eth.account().address;
    const bankrollerDeposit = playerDeposit * this._params.rules.depositX;
    this.bankrollerDeposit = bankrollerDeposit;
    const openingBlock = await this._params.Eth.getBlockNumber();
    // Args for open channel transaction
    const { n, e } = this.Rsa.getNE();

    const response = {
      channelId,
      playerAddress,
      playerDeposit,
      bankrollerAddress,
      bankrollerDeposit,
      openingBlock,
      gameData,
      n,
      e
    };
    // Args for open channel transaction
    const toSign: SolidityTypeValue[] = [
      { t: "bytes32", v: channelId },
      { t: "address", v: playerAddress },
      { t: "address", v: bankrollerAddress },
      { t: "uint", v: playerDeposit.toString() },
      { t: "uint", v: bankrollerDeposit.toString() },
      { t: "uint", v: openingBlock },
      { t: "uint", v: gameData },
      { t: "bytes", v: n },
      { t: "bytes", v: e }
    ];

    const signature = this._params.Eth.signHash(sha3(...toSign));

    return { response, signature };
  }
  async checkOpenChannel(): Promise<any> {
    const channel = await this._params.payChannelContract.methods
      .channels(this.channelId)
      .call();

    if (
      channel.state === "1" &&
      channel.player.toLowerCase() === this._params.userId.toLowerCase() &&
      channel.bankroller.toLowerCase() ===
        this._params.Eth.account().address.toLowerCase() &&
      "" + channel.playerBalance === "" + this.playerDeposit &&
      "" + channel.bankrollerBalance === "" + this.bankrollerDeposit
    ) {
      this.channel = channel;

      // Устанавливаем депозит игры
      this.payChannelLogic._setDeposits(
        channel.playerBalance,
        channel.bankrollerBalance
      );
      return channel;
    } else {
      throw new Error("channel not found");
    }
  }

  async call(
    data: CallParams
  ): Promise<{
    args: any[];
    hash: string;
    signature: string;
    state: any;
    returns: any;
  }> {
    if (
      !data ||
      !data.gamedata ||
      !data.seed ||
      !data.method ||
      !data.args ||
      !data.nonce
    ) {
      throw new Error("Invalid arguments");
    }

    if (data.method.substring(0, 1) === "_") {
      throw new Error("Cannot call private function");
    }

    const func = this._params.logic[data.method];
    if (typeof func !== "function") {
      throw new Error(`No function ${event} in game logic`);
    }

    // сверяем номер сессии
    this.nonce++;
    if (data.nonce * 1 !== this.nonce * 1) {
      throw new Error("Invalid nonce");
      // TODO: openDispute
    }

    // Инициализируем менеджер состояния канала для этого юзера если ещ нет
    if (!this.channelState) {
      this.channelState = new ChannelState(
        this._params.userId,
        this._params.Eth
      );
    }
    // Проверяем нет ли неподписанных юзером предыдущих состояний
    if (this.channelState.hasUnconfirmed()) {
      throw new Error(
        "Player " + this._params.userId + " not confirm previous channel state"
      );
    }

    // Проверяем что юзера достаточно бетов для этой ставки
    let userBets = this.channel.playerBalance;
    const lastState = this.channelState.getBankrollerSigned();

    if (lastState && lastState._playerBalance) {
      userBets = lastState._playerBalance;
    }

    console.log(dec2bet(userBets), dec2bet(data.userBet));
    if (dec2bet(userBets) < dec2bet(data.userBet) * 1) {
      throw new Error(
        "Player " + this._params.userId + " not enougth money for this bet"
      );
    }

    // проверка подписи
    const toSign: SolidityTypeValue[] = [
      { t: "bytes32", v: this.channelId },
      { t: "uint", v: this.nonce },
      { t: "uint", v: "" + data.userBet },
      { t: "uint", v: data.gamedata },
      { t: "bytes32", v: data.seed }
    ];
    const recoverOpenkey = this._params.Eth.recover(sha3(...toSign), data.sign);
    if (recoverOpenkey.toLowerCase() !== this._params.userId.toLowerCase()) {
      throw new Error("Invalid signature");
    }

    // Подписываем рандом

    const confirmed = this._confirmRandom(data);

    // Вызываем функцию игры
    let returns;
    try {
      returns = this._params.logic.Game(...confirmed.args);
    } catch (error) {
      const errorData = {
        message: `Cant call gamelogic function ${data.method} with args ${
          confirmed.args
        }`,
        error
      };
      throw new Error(JSON.stringify(errorData));
    }

    const state_data = {
      _id: this.channelId,
      _playerBalance: "" + this.payChannelLogic._getBalance().player,
      _bankrollerBalance: "" + this.payChannelLogic._getBalance().bankroller,
      _totalBet: "" + lastState._totalBet,
      _nonce: this.nonce
    };

    // Сохраняем подписанный нами последний стейт канала
    if (!this.channelState.addBankrollerSigned(state_data)) {
      throw new Error(
        "Prodblem with save last channel state - addBankrollerSignedState"
      );
    }
    return {
      ...confirmed,
      state: this.channelState.getBankrollerSigned(),
      returns
    };
  }

  _confirmRandom(
    data: CallParams
  ): {
    args: any[];
    hash: string;
    signature: string;
  } {
    let rnd_o: any = {};
    let rnd_i = "";
    for (let k in data.args) {
      let a = data.args[k];
      if (typeof a === "object" && typeof a.rnd === "object") {
        rnd_i = k;
        rnd_o = a.rnd;
        break;
      }
    }

    let args = data.args.slice(0);

    const toSign = [
      { t: "bytes32", v: this.channelId },
      { t: "uint", v: this.nonce },
      { t: "uint", v: "" + rnd_o.bet },
      { t: "uint", v: data.gamedata },
      { t: "bytes32", v: data.seed }
    ];

    const hash = sha3(...toSign);
    const signature = this.Rsa.sign(hash).toString();

    const signatureHash = sha3(signature);

    args[rnd_i] = signatureHash;
    // TODO refactor math
    // if (!user.paychannel._totalBet) {
    //   user.paychannel._totalBet = 0;
    // }
    // user.paychannel._totalBet += rnd_o.bet;

    return {
      args,
      hash,
      signature
      // rnd      : rnd // TODO: check
    };
  }
  updateState(data: { state: any }): { status: string } {
    if (!this.channelState.addPlayerSigned(data.state)) {
      throw new Error("incorrect data");
    }
    return { status: "ok" };
  }

  closeByConsent(data): { sign: string } {
    const lastState = this.channelState.getBankrollerSigned();

    // сохраняем "согласие" юзера на закрытие канала
    this.closeByConsentData = data;

    // Отправляем ему свою подпись закрытия
    let hash = sha3(
      { t: "bytes32", v: lastState._id },
      { t: "uint", v: lastState._playerBalance },
      { t: "uint", v: lastState._bankrollerBalance },
      { t: "uint", v: lastState._totalBet },
      { t: "uint", v: lastState._session },
      { t: "bool", v: true }
    );
    const sign = this._params.Eth.signHash(hash);

    return { sign };
  }

  async checkCloseChannel(data) {
    const channel = await this._params.payChannelContract.methods
      .channels(this.channelId)
      .call();
    if (channel.state === "2") {
      this.finish();
      return { status: "ok" };
    } else {
      //
      // user.paychannel.closeByConsent
      // ???
    }
  }
  finish() {
    this._params.onFinish(this._params.userId);
  }

  reconnect(data) {
    logger.debug("User reconnect");
    //TODE implement or delete
  }
  disconnect() {
    this.finish();
    return { disconnected: true };
  }
}
