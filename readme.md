This repository stores source code that implements logic behind core solution elements.

- ChannelState.ts contains the channel state change logic during a game session. It indicate when a state is changed and how the parties approve it.
- DApp.ts contains the general game logic.
- DAppInstance.ts contains the code applied to create and run a specific game instance (session) according to the general workflow from game initialization when a channel is created, through bankroller and player account checks and despositing, actual gambling process, result computation and distribution of funds.
- GlobalGameLogicStore.ts
- PayChannelLogic.ts
- index.ts just exports everything
