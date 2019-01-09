import { ProtocolType } from '@daocasino/dc-statistics-client'

export interface IStatisticsServerConnectParams {
  authKey: string,
  host: string,
  protocol: ProtocolType
}