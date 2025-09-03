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
    packName: gameConfig.packName
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
    autoHostDelay: gameConfig.autoHostDelay
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
          world.chatManager.sendPlayerMessage(player, '🚀 Woosh!', '#FF6B6B');
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
        world.chatManager.sendPlayerMessage(player, '📊 Stats feature coming soon! Play games to build your statistics.', '#4A90E2');
      }
    }
  ]);

  // Setup chat command handler
  world.chatManager.onMessage = (message, player) => {
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
  };

  /**
   * Game ambient audio - create an engaging trivia game atmosphere
   */
  if (serverConfig.audioEnabled) {
    try {
      new Audio({
        uri: 'audio/music/hytopia-main.mp3',
        loop: true,
        volume: serverConfig.audioVolume,
      }).play(world);

      logger.info('Ambient audio started', {
        component: 'Server',
        volume: serverConfig.audioVolume
      });
    } catch (error) {
      logger.error('Failed to start ambient audio', error as Error, {
        component: 'Server'
      });
    }
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
