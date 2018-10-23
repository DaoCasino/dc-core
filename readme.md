This repository stores source code that implements logic behind core solution elements. Actual source files are stored in the **src** folder. src/index.ts file interacts with other files from this folder.

- **ChannelState.ts** contains the channel state change logic during a game session. It indicates when a state is changed and how the parties approve it.
- **DApp.ts** contains the general game logic.
- **DAppDealerInstance.ts** and **DAppPlayerInstance** contain the code applied to create and run a specific game instance (session) - bankroller and player side- according to the general workflow from game initialization when a channel is created, through bankroller and player account checks and despositing, actual gambling process, result computation and distribution of funds. Note that this file 
- GlobalGameLogicStore.ts  
- ChannelState.ts stores the logic behind state change during a game.
- RSA.ts implements the encryption logic. 


The index.ts file in the root folder of this repository imports the resulting configuration from the src/index.ts. 
