# 🎯 BUZZCHAIN - Ultimate Trivia Game

A production-ready, server-authoritative multiplayer trivia game built for HYTOPIA. Features complete trivia gameplay with modern web UI and persistent player statistics.

## 🎮 Game Features

### Core Gameplay
- **2-6 Player Multiplayer** with server-authoritative game state
- **6 Categories × 5 Values** board (100-500 points) 
- **Daily Doubles** with custom wagers
- **Final Round** with private wagers and simultaneous answers
- **Buzz System** with 300ms lockout + timed response window
- **Answer Normalization** (case-insensitive, article-stripping, fuzzy matching)

### Single Player Mode with AI 🤖
- **AI Opponents** with realistic human-like behavior
- **5 Unique AI Personalities** (Scholar, Speedster, Thinker, Newbie, Strategist)
- **Configurable Difficulty Levels** (Easy, Medium, Hard, Expert)
- **NPC Visual Representation** using HYTOPIA's built-in models
- **Realistic Reaction Times** and strategic decision-making
- **Chat Commands**: `/singleplayer [count]` to start with AI players

### Technical Features
- **Mobile-Responsive UI** with touch-optimized controls
- **Persistent Player Statistics** (games, wins, streaks, buzz times)
- **Global Leaderboards** (most wins, highest scores, fastest buzzes)
- **Anti-Cheat Protection** with server-side validation
- **Rate Limiting** to prevent spam and abuse
- **Modular Question Packs** with validation system

## 🚀 Quick Start

### Prerequisites
- **Node.js** >=18.0.0 (download from [nodejs.org](https://nodejs.org/))
- **NPM** >=8.0.0 (comes with Node.js)
- **HYTOPIA SDK** account and CLI tools

### Installation
```bash
# Verify your Node.js/NPM setup first
node verify-setup.js

# Install dependencies using NPM only
npm install

# If you encounter issues, clean install
npm run install:clean
```

### Node.js & NPM Requirements
This project is designed to work exclusively with **Node.js** and **NPM**. It does not support Bun or any other JavaScript runtime.

**Required Versions:**
- Node.js: >=18.0.0
- NPM: >=8.0.0

**Why Node.js/NPM only:**
- Official HYTOPIA SDK support
- Consistent dependency resolution
- Standard TypeScript compilation
- Cross-platform compatibility
- Enterprise-grade package management

### Development
```bash
# Start development server (uses HYTOPIA CLI)
npm run dev

# The server will start on default HYTOPIA port
# Open HYTOPIA Play client and connect to your local server
```

### Production
```bash
# Build for production
npm run build

# Package for deployment
npm run package
```

## 📁 Project Structure

```
clueboard/
├── assets/
│   ├── packs/
│   │   └── trivia_pack.json     # Demo question pack
│   └── ui/
│       ├── overlay.html         # Game UI
│       └── overlay.css         # UI styles
├── src/
│   ├── game/
│   │   ├── GameManager.ts      # Main game state machine
│   │   ├── BuzzManager.ts      # Buzz timing and lockout
│   │   ├── ScoreManager.ts     # Scoring and persistence
│   │   ├── RoundManager.ts     # Board rounds and Daily Doubles
│   │   ├── PackLoader.ts       # Question pack validation
│   │   └── Normalize.ts        # Answer normalization
│   ├── net/
│   │   └── Events.ts          # Networking events and types
│   └── util/
│       └── Persistence.ts     # Player stats and leaderboards
├── index.ts                   # Server entry point
└── package.json
```

## 🎯 Gameplay Flow

### 1. Lobby Phase
- Players join (2-6 supported)
- Auto-start when minimum players reached
- Host assignment (first player or auto-assigned)

### 2. Round 1 & 2
- 6 categories with 5 clues each
- Values: $100, $200, $300, $400, $500 (doubled in Round 2)
- 1-2 Daily Doubles per round
- Buzz-in system with lockout period
- Correct answer = picker control, wrong = deduction + lock

### 3. Daily Doubles
- Only current picker can answer
- Custom wager up to max(clue value, player score)
- No buzz system - direct answer input

### 4. Final Round
- All players wager simultaneously
- Single clue revealed after wagers locked
- Private answer submission
- Dramatic reveal of results

### 5. Results & Statistics
- Winner announcement
- Score breakdown
- Statistics updated (persistent)
- Leaderboards refreshed
- Auto-restart for new game

## 🏆 Statistics Tracked

### Per-Player Stats
- Games played/won
- Correct/incorrect answers (percentage)
- Buzz success rate
- Average buzz time
- Fastest buzz time
- Win streaks (current/longest)
- Daily Double performance
- Final Round success
- Lifetime score totals

### Global Leaderboards
- Most Wins
- Highest Single Game Score
- Best Correct Answer Percentage
- Fastest Buzz Times
- Longest Win Streaks
- Most Games Played

## 📱 Mobile Support

The game includes comprehensive mobile optimizations:
- **Responsive Grid Layout** (3-column on phones)
- **Touch-Optimized Controls** with large hit targets
- **Mobile Buzz Button** (separate from desktop version)
- **Keyboard-Safe Input Areas**
- **Adaptive Font Sizes**
- **Gesture-Friendly Interface**

## 🔧 Customization

### Creating Question Packs

Question packs use JSON format with validation:

```json
{
  "packId": "my-custom-pack",
  "title": "My Trivia Pack",
  "categories": [
    {
      "name": "CATEGORY NAME",
      "clues": [
        {
          "value": 100,
          "clue": "This is the clue text.",
          "answer": "What is the answer?"
        }
      ]
    }
  ],
  "dailyDoubles": [
    { "category": 1, "index": 3 }
  ],
  "finalRound": {
    "category": "FINAL CATEGORY",
    "clue": "Final Round clue text.",
    "answer": "What is the final answer?"
  }
}
```

### Pack Validation Rules
- Must have exactly 6 categories
- Each category needs exactly 5 clues
- Standard values: 100, 200, 300, 400, 500
- 1-3 Daily Doubles recommended
- All fields required and validated

### Game Configuration

Modify GameManager initialization in `index.ts`:

```typescript
const gameManager = new GameManager(world, {
  packName: 'my-custom-pack',  // Custom question pack
  autoStart: true,             // Auto-start when min players join
  autoHostDelay: 15000,        // Delay before auto-start (ms)
  hostPlayerId: 'player-id'    // Force specific host (optional)
});
```

## 🛡️ Security Features

### Server-Authoritative Design
- All game logic runs on server
- Client UI is display-only
- No client-side game state modification
- Authoritative timing and scoring

### Anti-Cheat Measures
- Rate limiting on buzz attempts
- Server-side answer validation
- Timestamp verification
- Input sanitization
- Session validation

### Fair Play Systems
- Consistent buzz timing measurement
- Lockout period enforcement
- Anti-spam cooldowns
- Duplicate prevention

## 🎨 UI Customization

The game UI is built with modern CSS and includes:
- **CSS Variables** for easy theming
- **Responsive Breakpoints** for all devices
- **Animation System** with reduced-motion support
- **Accessibility Features** (ARIA labels, keyboard nav)
- **Performance Optimizations** (GPU acceleration)

Key CSS classes for customization:
- `.board` - Main game board
- `.clue-cell` - Individual clue buttons
- `.buzz-btn` - Buzz button styling
- `.score-panel` - Player scores display
- `.modal-content` - Clue/answer dialogs

## 🧪 Testing

### Local Testing
1. Run `npm run dev` (starts HYTOPIA development server)
2. Open HYTOPIA Play client in browser
3. Connect to localhost
4. **For Single Player Mode:**
   - Type `/singleplayer` in chat (starts with 3 AI opponents)
   - Type `/singleplayer 5` for 5 AI opponents
   - Join the game and play against AI!
5. **For Multiplayer Mode:**
   - Open multiple HYTOPIA Play clients in different browser tabs/windows
   - Connect all clients to localhost
   - Test full game flow with 2+ human players
6. Verify all features work with Node.js/NPM environment

### Single Player Mode Commands
```bash
/singleplayer          # Start with 3 AI opponents
/singleplayer 5        # Start with 5 AI opponents
/singleplayer 1        # Start with 1 AI opponent
/multiplayer           # Return to multiplayer mode
/help                  # Show all available commands
```

### Multiplayer Testing
- Use HYTOPIA's built-in multiplayer testing features
- Test with various player counts (2-6 players supported)
- Verify mobile responsiveness on different devices
- Check network stability and synchronization
- Ensure no Bun runtime dependencies are required

### Environment Verification
```bash
# Verify Node.js version
node --version  # Should be >=18.0.0

# Verify NPM version
npm --version   # Should be >=8.0.0

# Verify no Bun installation
which bun || echo "Bun not found - good!"
```

## 🚢 Deployment

### Prerequisites
- Node.js >=18.0.0 installed
- NPM >=8.0.0 installed
- HYTOPIA creator account

### HYTOPIA Platform Deployment
1. **Build**: `npm run build` (compiles TypeScript using Node.js/NPM)
2. **Package**: `npm run package` (creates deployment package)
3. **Upload**: Upload via HYTOPIA creator portal
4. **Configure**: Set environment variables in HYTOPIA dashboard

### Environment Variables (Production)
```
HYTOPIA_API_KEY=your-api-key
HYTOPIA_GAME_ID=your-game-id
HYTOPIA_LOBBY_ID=your-lobby-id
NODE_ENV=production
```

### Runtime Requirements
- **Runtime**: Node.js only (Bun is not supported)
- **Package Manager**: NPM only
- **Build Tool**: TypeScript compiler via NPM scripts
- **Deployment**: HYTOPIA platform handles runtime environment

## 📊 Analytics & Monitoring

The game includes built-in logging and metrics:
- Player join/leave events
- Game performance statistics
- Error tracking and reporting
- Persistence operation monitoring

## 🤝 Contributing

To extend the game:
1. Follow HYTOPIA SDK patterns
2. Maintain server-authoritative design
3. Add proper TypeScript types
4. Update documentation
5. Test multiplayer scenarios

## 📄 License

MIT License - feel free to modify and distribute.

## 🔗 HYTOPIA Resources

- [HYTOPIA SDK Documentation](https://dev.hytopia.com)
- [Community Discord](https://discord.gg/DXCXJbHSJX)
- [Example Projects](https://github.com/hytopiagg/sdk/tree/main/examples)
- [Creator Portal](https://create.hytopia.com)

---

**Built with ❤️ for the HYTOPIA platform**

*This implementation follows all HYTOPIA SDK best practices and provides a complete, production-ready multiplayer trivia experience.*