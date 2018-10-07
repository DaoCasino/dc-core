import { IMessagingProvider } from 'dc-messaging';
import { Eth } from 'dc-ethereum-utils';
import Contract from 'web3/eth/contract';
import { GameInfo } from './GameInfo';
import { GameLogicFunction } from './index';

export interface DAppInstanceParams {
  userId: UserId;
  num: number;
  rules: any;
  payChannelContract: Contract;
  payChannelContractAddress: string;
  roomAddress: string;
  gameLogicFunction: GameLogicFunction;
  roomProvider: IMessagingProvider;
  onFinish: (userId: UserId) => void;
  gameInfo: GameInfo;
  Eth: Eth;
}

export type UserId = string;

export interface OpenChannelParams {
  playerAddress: string;
  playerDeposit: number;
  gameData: any;
}
export interface GetChannelDataParams extends OpenChannelParams {
  channelId: string;
}
export interface CallParams {
  userBet: number;
  gameData: number[];
  seed: string;
  nonce: number;
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

export interface DAppInstanceView {
  deposit: number;
  playerBalance: number;
  bankrollerBalance: number;
  profit: number;
  playerAddress: string;
}
export interface IDAppInstance {
  on(event: string, func: (data: any) => void);
  getOpenChannelData: (
    data: OpenChannelParams
  ) => Promise<SignedResponse<OpenChannelData>>;
  checkOpenChannel: () => Promise<any>;
  updateState: (data: { state: any }) => { status: string };
  closeByConsent: (data: any) => { sign: string };
  checkCloseChannel: (data: any) => void;
  call: (
    data: CallParams
  ) => Promise<{
    signature: string;
    randomHash: string;
    gameLogicCallResult: any;
  }>;
  reconnect: (data: any) => void;
  //closeTimeout(); WTF???
  disconnect: (data: any) => void;
}
