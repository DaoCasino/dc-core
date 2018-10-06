import { IPayChannelLogic } from './IPayChannelLogic';

export interface IGameLogic {
  Game: Function;
  history: any[];
}

export type GameLogicFunction = (payChannel: IPayChannelLogic) => IGameLogic;
