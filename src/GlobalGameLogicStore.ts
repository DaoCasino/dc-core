export class GlobalGameLogicStore {
  getGameLogic(slug) {
    const globalStore: any = global || window
    return globalStore.DAppsLogic[slug]
  }
  defineDAppLogic(slug, logicConstructor) {
    const globalStore: any = global || window
    globalStore.DAppsLogic = globalStore.DAppsLogic || {}
    globalStore.DAppsLogic[slug] = logicConstructor
  }
}
