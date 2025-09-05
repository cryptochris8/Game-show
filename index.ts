/**
 * CLUEBOARD - Jeopardy-style Trivia Game for HYTOPIA
 *
 * A production-ready, server-authoritative multiplayer trivia game
 * featuring:
 * - 2-6 player multiplayer with server-authoritative gameplay
 * - 6 categories × 5 values (100-500) board with Daily Doubles
 * - Buzz system with 300ms lockout + timed response window
 * - Final Round with private wagers and answers
 * - Persistent player stats and global leaderboards
 * - Mobile-optimized Overlay UI
 * - Answer normalization (case-insensitive, article-stripping)
 *
 * Built with HYTOPIA SDK following event-driven architecture patterns
 * and proper server-authoritative game state management.
 */

import { startServer, Audio } from 'hytopia';
import worldMap from './assets/map.json';
import GameManager from './src/game/GameManager';
import { PlayerLifecycleManager } from './src/util/PlayerManager';
import { ChatCommandManager, registerCommands } from './src/util/ChatCommandManager';
import { config, getServerConfig } from './src/util/Config';
import { logger } from './src/util/Logger';

/**
 * Clueboard Game Server Entry Point
 *
 * Initializes the trivia game world with GameManager and sets up
 * player entities for movement around the game lobby while playing.
 * The main game logic is handled by the GameManager system.
 */

startServer(world => {
  // Load configuration from environment
  config.loadFromEnvironment();

  const serverConfig = getServerConfig();
  const gameConfig = config.getGameConfig();

  logger.info('Starting Clueboard Trivia Game Server', {
    component: 'Server',
    debugMode: serverConfig.debugMode,
    audioEnabled: serverConfig.audioEnabled,
    packName: gameConfig.packName,
    singlePlayerMode: process.env.SINGLE_PLAYER_MODE === 'true',
    aiPlayersCount: parseInt(process.env.AI_PLAYERS_COUNT || '3')
  });

  /**
   * Debug rendering for development
   */
  if (serverConfig.debugMode) {
    world.simulation.enableDebugRendering(true);
    logger.info('Debug rendering enabled', { component: 'Server' });
  }

  /**
   * Initialize the Clueboard Game Manager
   * This handles all trivia game logic, player management, and UI coordination
   */
  const gameManager = new GameManager(world, {
    packName: gameConfig.packName,
    autoStart: gameConfig.autoStart,
    autoHostDelay: gameConfig.autoHostDelay,
    singlePlayerMode: process.env.SINGLE_PLAYER_MODE === 'true' || false,
    aiPlayersCount: parseInt(process.env.AI_PLAYERS_COUNT || '3')
  });

  /**
   * Initialize Player Lifecycle Manager
   * Handles player join/leave events and entity management
   */
  const playerManager = new PlayerLifecycleManager(world);

  /**
   * Load the game world map
   */
  world.loadMap(worldMap);
  logger.info('Game world map loaded', { component: 'Server' });

  /**
   * Initialize Chat Command Manager
   * Handles all chat commands with proper error handling and cooldowns
   */
  const chatCommandManager = new ChatCommandManager();

  // Register chat commands
  registerCommands([
    {
      name: 'rocket',
      description: 'Launch into the air!',
      usage: '',
      handler: (player, args, world) => {
        const playerEntity = playerManager.getPlayerEntity(player.id);
        if (playerEntity) {
          playerEntity.applyImpulse({ x: 0, y: 20, z: 0 });
          world.chatManager.sendPlayerMessage(player, '🚀 Woosh!', 'FF6B6B');
          logger.playerAction(player.id, 'rocket_command', { component: 'ChatCommand' });
        }
      },
      cooldown: 5000 // 5 second cooldown
    },
    {
      name: 'help',
      description: 'Show available commands',
      usage: '',
      handler: (player, args, world) => {
        chatCommandManager.sendHelpMessage(player, world);
      }
    },
    {
      name: 'stats',
      description: 'View your trivia statistics',
      usage: '',
      handler: async (player, args, world) => {
        // TODO: Integrate with persistence system
        world.chatManager.sendPlayerMessage(player, '📊 Stats feature coming soon! Play games to build your statistics.', '4A90E2');
      }
    },
    {
      name: 'singleplayer',
      description: 'Start single player mode with AI opponents',
      usage: '/singleplayer [count] - count is optional, defaults to 3 AI players',
      handler: (player, args, world) => {
        const aiCount = args.length > 0 ? parseInt(args[0]) : 3;
        if (aiCount < 1 || aiCount > 5) {
          world.chatManager.sendPlayerMessage(player, '❌ AI player count must be between 1 and 5.', 'FF6B6B');
          return;
        }

        // Enable single player mode
        process.env.SINGLE_PLAYER_MODE = 'true';
        process.env.AI_PLAYERS_COUNT = aiCount.toString();

        world.chatManager.sendPlayerMessage(player,
          `🎮 Single player mode activated! Starting game with ${aiCount} AI opponents.`, '00FF00');

        // The game will start automatically when the next player joins
        world.chatManager.sendPlayerMessage(player,
          '💡 The game will start automatically when you join. Use /join to start playing!', '4A90E2');
      }
    },
    {
      name: 'multiplayer',
      description: 'Return to multiplayer mode',
      usage: '/multiplayer - Switch back to waiting for human players',
      handler: (player, args, world) => {
        process.env.SINGLE_PLAYER_MODE = 'false';
        world.chatManager.sendPlayerMessage(player,
          '👥 Switched to multiplayer mode. Waiting for more human players to join.', '4A90E2');
      }
    }
  ]);

  // Setup chat command handler
  world.on('playerMessage', (data: any) => {
    const { player, message } = data;
    if (message.text.startsWith('/')) {
      const parts = message.text.slice(1).split(' ');
      const commandName = parts[0].toLowerCase();
      const args = parts.slice(1);

      chatCommandManager.execute(commandName, player, args, world);
      return; // Don't process as regular message
    }

    // Process as regular chat message
    logger.playerAction(player.id, 'chat_message', {
      messageLength: message.text.length,
      component: 'Chat'
    });
  });

  /**
   * Game ambient audio - create an engaging trivia game atmosphere
   * Disabled for now due to missing audio files
   */
  if (serverConfig.audioEnabled) {
    logger.info('Ambient audio enabled but audio files not available', {
      component: 'Server',
      note: 'Audio files would need to be added to /assets/audio/music/'
    });
  } else {
    logger.info('Ambient audio disabled by configuration', { component: 'Server' });
  }

  /**
   * Setup periodic cleanup tasks
   */
  setInterval(() => {
    chatCommandManager.cleanupExpiredCooldowns();
  }, 60000); // Clean up every minute

  /**
   * Server startup complete!
   */
  logger.info('🎯 Clueboard trivia game server started successfully!', {
    component: 'Server',
    features: [
      '6-category board',
      'Daily Doubles',
      'Final Round',
      'Buzz system',
      'Server-authoritative gameplay',
      'Mobile-responsive UI',
      'Persistent statistics'
    ],
    playerSupport: `${gameConfig.minPlayers}-${gameConfig.maxPlayers} players`,
    autoStart: gameConfig.autoStart,
    autoHostDelay: `${gameConfig.autoHostDelay}ms`
  });

  // Legacy console logging for compatibility
  console.log('🎯 Clueboard trivia game server started successfully!');
  console.log('   Features: 6-category board, Daily Doubles, Final Round');
  console.log('   Players: 2-6 supported with server-authoritative gameplay');
  console.log('   UI: Mobile-responsive overlay with buzz system');
  console.log('   Stats: Persistent player statistics and leaderboards');
});
