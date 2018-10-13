import { IPayChannelLogic } from "./IPayChannelLogic"

export interface IGameLogic {
  Game: any
  history: any[]
}

export type GameLogicFunction = (payChannel: IPayChannelLogic) => IGameLogic
