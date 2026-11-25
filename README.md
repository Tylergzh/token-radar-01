# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Tylergzh/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Tylergzh/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar analyzes a sealed snapshot of 758 protocols from DefiLlama to identify 40 high-potential watchlist protocols that have yet to launch a token, carefully filtering out wrapped or staked versions of existing assets. The tool calculates and ranks these protocols by their implied value, producing a static web dashboard that provides an overview board, detailed farming guides for each protocol, and customized filtered views. The top 5 protocols by implied value identified are Steakhouse Financial ($596,023,407), Gauntlet ($388,895,968), Veda ($170,267,601), USDD ($164,747,701), and Nonce Capital ($114,598,195).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The script generates several outputs in the designated output directory: `board.json` containing 200 rows of protocol data including implied USD value and farming plans, `data.js` for the frontend, copies of the `dashboard/` and `screenshots/` directories, and a comprehensive `dossier.json`. It is designed for Node 22, uses only the standard library, and operates entirely offline.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3wx035x5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
