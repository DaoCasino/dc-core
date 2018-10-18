This repository stores source code that implements logic behind core solution elements. 
- ChannelState.ts contains the logic of channel state use in a game.
- DApp.ts contains the general game logic.
- DAppInstance.ts contains the code applied to create and run a specific game instance (session) according to the general workflow from game initialization when a channel is created, through bankroller and player account checks and despositing, actual gambling process, result computation and distribution of funds.
- GlobalGameLogicStore.ts
- PayChannelLogic.ts
- index.ts is not supposed to be modified in the standard development process. It loads a game by calling other files. 
