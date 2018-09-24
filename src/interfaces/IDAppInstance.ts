import { ISharedRoom, IMessagingProvider } from "dc-messaging";
import { Eth } from "dc-ethereum-utils";
import { ContractInfo } from "dc-configs";

export interface GameInfo {
  slug: string;
  hash: string;
  contract: ContractInfo;
  gameId: string;
}
export interface DAppInstanceParams {
  userId: UserId;
  num: number;
  rules: any;
  payChannelContract: any;
  logic: any;
  roomProvider: IMessagingProvider;
  onFinish: (userId: UserId) => void;
  gameInfo: GameInfo;
  Eth: Eth;
}

export interface DAppParams {
  slug: string;
  rules: any;
  // timer: number;
  // checkTimeout: number;
  contract: ContractInfo;
  roomProvider: IMessagingProvider;
  Eth: Eth;
}
export type UserId = string;

export interface OpenChannelParams {
  channelId: string;
  playerAddress: string;
  playerDeposit: number;
  gameData: any;
}
export interface CallParams {
  gamedata: any;
  seed: any;
  method: string;
  args: any[];
  nonce: number;
  userBet: number;
  sign: string;
}
export interface OpenChannelData {
  channelId: any; //TODO
  playerAddress: string;
  playerDeposit: number;
  bankrollerAddress: string;
  bankrollerDeposit: number;
  openingBlock: string;
  gameData: string;
  n: string;
  e: string;
}
export interface SignedResponse<TResponse> {
  response: TResponse;
  signature: string;
}
export interface IDApp {}
export interface IDAppInstance {
  getOpenChannelData: (
    data: OpenChannelParams
  ) => Promise<SignedResponse<OpenChannelData>>;
  checkOpenChannel: () => Promise<any>;
  updateState: (data: { state: any }) => { status: string };
  closeByConsent: (data: any) => { sign: string };
  checkCloseChannel: (data: any) => void;
  call: (data: CallParams) => void;
  reconnect: (data: any) => void;
  //closeTimeout(); WTF???
  disconnect: (data: any) => void;
}
export interface GameInfo {
  slug: string;
  hash: string;
  contract: ContractInfo;
  gameId: string;
}
export interface DAppInstanceParams {
  userId: UserId;
  num: number;
  rules: any;
  payChannelContract: any;
  logic: any;
  roomProvider: IMessagingProvider;
  onFinish: (userId: UserId) => void;
  gameInfo: GameInfo;
  Eth: Eth;
}
