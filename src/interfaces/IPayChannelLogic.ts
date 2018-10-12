export interface IPayChannelLogic {
  addTX: (profit: number) => void
  getBalance: () => number
  printLog: () => void
}
