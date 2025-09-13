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

import { startServer, Audio, PlayerEvent, PlayerUIEvent } from 'hytopia';
import worldMap from './assets/maps/minimal-lobby.json';
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
   * Initialize Audio System for Buzzchain Experience
   */
  const audioSystem = {
    backgroundMusic: null as Audio | null,
    soundEffects: new Map<string, Audio>(),
    musicEnabled: true,
    sfxEnabled: true
  };

  // Initialize background music
  if (serverConfig.audioEnabled) {
    audioSystem.backgroundMusic = new Audio({
      uri: 'audio/music/main-menu.mp3',
      loop: true,
      volume: 0.3
    });

    // Initialize sound effects
    const soundEffects = [
      { name: 'hover', uri: 'audio/sfx/hover.mp3', volume: 0.2 },
      { name: 'click', uri: 'audio/sfx/click.mp3', volume: 0.4 },
      { name: 'confirm', uri: 'audio/sfx/confirm.mp3', volume: 0.5 },
      { name: 'transition', uri: 'audio/sfx/transition.mp3', volume: 0.6 },
      { name: 'buzz', uri: 'audio/sfx/buzz.mp3', volume: 0.7 },
      { name: 'correct', uri: 'audio/sfx/correct.mp3', volume: 0.6 },
      { name: 'incorrect', uri: 'audio/sfx/incorrect.mp3', volume: 0.5 }
    ];

    soundEffects.forEach(sfx => {
      audioSystem.soundEffects.set(sfx.name, new Audio({
        uri: sfx.uri,
        loop: false,
        volume: sfx.volume
      }));
    });

    logger.info('Audio system initialized with music and sound effects', {
      component: 'AudioSystem',
      backgroundMusic: !!audioSystem.backgroundMusic,
      soundEffectsCount: audioSystem.soundEffects.size
    });
  }

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

  /**
   * Player Join Event - Load Main Menu UI
   */
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    logger.info(`Player joined - loading main menu UI: ${player.username}`, {
      component: 'UISystem',
      playerId: player.id
    });

    // Load the main menu for the player
    player.ui.load('ui/main-menu.html');

    // Unlock pointer so they can interact with the menu
    player.ui.lockPointer(false);

    // Start background music if enabled
    if (audioSystem.backgroundMusic && audioSystem.musicEnabled) {
      audioSystem.backgroundMusic.play(world);
    }

    // Set up UI event handler for this player
    player.ui.on(PlayerUIEvent.DATA, ({ data }) => {
      handlePlayerUIEvent(player, data);
    });

    // Send player ID to UI
    player.ui.sendData({
      type: 'PLAYER_ID',
      payload: player.id
    });
  });

  /**
   * Handle UI Events from Players
   */
  function handlePlayerUIEvent(player: any, data: any) {
    console.log(`Received ${data.type} from ${player.username}:`, data.payload);

    switch (data.type) {
      case 'START_SINGLE_PLAYER':
        startSinglePlayerMode(player, data.payload);
        break;

      case 'START_MULTIPLAYER':
        startMultiplayerMode(player, data.payload);
        break;

      case 'TOGGLE_MUSIC':
        togglePlayerMusic(player, data.payload.enabled);
        break;

      case 'TOGGLE_SFX':
        audioSystem.sfxEnabled = data.payload.enabled;
        logger.info(`SFX ${data.payload.enabled ? 'enabled' : 'disabled'} for ${player.username}`);
        break;

      case 'PLAY_SOUND':
        playSound(data.payload.sound);
        break;

      case 'LOAD_GAME_UI':
        // UI-focused mode: Don't load separate game UI, keep main menu
        logger.info(`Keeping main menu UI for ${player.username} (UI-focused mode)`, {
          component: 'UISystem',
          playerId: player.id
        });
        break;

      default:
        console.log(`Unknown event type: ${data.type}`);
        // Forward other events to GameManager
        if (gameManager) {
          gameManager.handleUIEvent(player, data);
        }
    }
  }

  /**
   * Start Single Player Mode
   */
  function startSinglePlayerMode(player: any, config: any) {
    logger.info(`Starting single player mode for ${player.username}`, {
      component: 'GameMode',
      aiCount: config.aiCount,
      playerId: player.id
    });

    // Update game config
    gameManager.updateConfig({
      singlePlayerMode: true,
      aiPlayersCount: config.aiCount || 3
    });

    // Initialize AI players
    gameManager.initializeAIPlayers();

    // Send ready signal to player
    player.ui.sendData({
      type: 'GAME_READY',
      payload: { mode: 'singleplayer', aiCount: config.aiCount }
    });
  }

  /**
   * Start Multiplayer Mode
   */
  function startMultiplayerMode(player: any, config: any) {
    logger.info(`Starting multiplayer mode for ${player.username}`, {
      component: 'GameMode',
      playerId: player.id
    });

    // Update game config
    gameManager.updateConfig({
      singlePlayerMode: false,
      aiPlayersCount: 0
    });

    // Send ready signal to player
    player.ui.sendData({
      type: 'GAME_READY',
      payload: { mode: 'multiplayer' }
    });
  }

  /**
   * Toggle Music for Player
   */
  function togglePlayerMusic(player: any, enabled: boolean) {
    audioSystem.musicEnabled = enabled;
    
    if (audioSystem.backgroundMusic) {
      if (enabled) {
        audioSystem.backgroundMusic.play(world);
      } else {
        audioSystem.backgroundMusic.pause();
      }
    }
    
    logger.info(`Music ${enabled ? 'enabled' : 'disabled'} for ${player.username}`);
  }

  /**
   * Play Sound Effect
   */
  function playSound(soundName: string) {
    if (!audioSystem.sfxEnabled) return;

    const sound = audioSystem.soundEffects.get(soundName);
    if (sound) {
      sound.play(world);
    } else {
      logger.warn(`Sound effect not found: ${soundName}`, { component: 'AudioSystem' });
    }
  }

  /**
   * Load Game UI
   */
  function loadGameUI(player: any) {
    logger.info(`Loading game UI for ${player.username}`, {
      component: 'UISystem',
      playerId: player.id
    });

    // Load the original game UI
    player.ui.load('ui/overlay.html');

    // Lock pointer for game interaction
    player.ui.lockPointer(true);

    // Stop main menu music and start game music if available
    if (audioSystem.backgroundMusic) {
      audioSystem.backgroundMusic.pause();
    }

    // TODO: Start game-specific background music
  }

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
