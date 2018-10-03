export class GlobalGameLogicStore {
  /**
   * Define DApp logic constructor function
   * @param {string} dapp_slug         unique slug of your dapp
   * @param {function} logic_constructor constructor Dapp logic
   */
  getGameLogic(slug) {
    const globalStore = global || window;
    return globalStore["DAppsLogic"][slug];
  }
  defineDAppLogic(slug, logicConstructor) {
    const globalStore = global || window;
    globalStore["DAppsLogic"] = globalStore["DAppsLogic"] || {};
    globalStore["DAppsLogic"][slug] = logicConstructor;
  }
}
