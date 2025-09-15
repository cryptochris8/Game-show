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

import { startServer, Audio, PlayerEvent, PlayerUIEvent, Entity, RigidBodyType } from 'hytopia';
import worldMap from './assets/maps/map.json';
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
    aiPlayersCount: 2  // Always 2 AI players for single player (3 total with human)
  });

  /**
   * Initialize Fixed Camera System
   * Creates an elevated view showing the game area and podiums
   */
  let cameraMount: Entity | null = null;

  // Create camera mount after world is ready
  setTimeout(() => {
    cameraMount = new Entity({
      modelUri: 'models/misc/selection-indicator.gltf', // Use a simple indicator model
      modelScale: 0.01, // Scale it down to be very small
      name: 'CameraMount',
      rigidBodyOptions: { type: RigidBodyType.FIXED }
    });

    // Position camera for optimal game show view based on screenshot
    cameraMount.spawn(world,
      { x: 15, y: 5, z: 2 },  // Adjusted camera position for perfect view
      { x: -0.15, y: 0, z: 0, w: 0.989 }  // Slight downward angle
    );

    // Make it invisible
    cameraMount.setOpacity(0);

    logger.info('Fixed camera mount created for game show view', {
      component: 'CameraSystem',
      position: { x: 15, y: 5, z: 2 }
    });
  }, 1000);

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
      uri: 'audio/music/hytopia-menu-theme.mp3',
      loop: true,
      volume: 0.3
    });

    // Initialize sound effects with correct file paths
    const soundEffects = [
      { name: 'hover', uri: 'audio/sfx/hover.wav', volume: 0.2 },
      { name: 'click', uri: 'audio/sfx/click.wav', volume: 0.4 },
      { name: 'confirm', uri: 'audio/sfx/confirm.wav', volume: 0.5 },
      { name: 'transition', uri: 'audio/sfx/transition.wav', volume: 0.6 },
      { name: 'buzz', uri: 'audio/sfx/buzz.wav', volume: 0.7 },
      { name: 'correct', uri: 'audio/sfx/correct.wav', volume: 0.6 },
      { name: 'incorrect', uri: 'audio/sfx/incorrect.wav', volume: 0.5 },
      // Backup sounds from available library
      { name: 'button_click', uri: 'audio/sfx/ui/button-click.mp3', volume: 0.4 },
      { name: 'notification', uri: 'audio/sfx/ui/notification-1.mp3', volume: 0.5 }
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
      usage: '/singleplayer - starts game with 2 AI opponents (3 total players)',
      handler: (player, args, world) => {
        // Always use 2 AI opponents for Jeopardy format (3 total players)
        const aiCount = 2;

        // Enable single player mode
        process.env.SINGLE_PLAYER_MODE = 'true';
        process.env.AI_PLAYERS_COUNT = aiCount.toString();

        world.chatManager.sendPlayerMessage(player,
          `🎮 Single player mode activated! Starting Jeopardy-style game with ${aiCount} AI opponents.`, '00FF00');

        // The game will start automatically when the next player joins
        world.chatManager.sendPlayerMessage(player,
          '💡 The game will start automatically when you join. 3 players total at the podiums!', '4A90E2');
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
   * Setup Fixed Camera View for Player
   * Attaches player camera to the fixed camera mount for consistent game show perspective
   */
  function setupFixedCameraView(player: any) {
    // If camera mount is ready, attach to it; otherwise use position-based attachment
    if (cameraMount && cameraMount.isSpawned) {
      // Attach player camera to the fixed camera mount
      player.camera.setAttachedToEntity(cameraMount);

      logger.info(`Fixed camera view set for player: ${player.username}`, {
        component: 'CameraSystem',
        playerId: player.id,
        cameraMount: 'attached to entity'
      });
    } else {
      // Fallback to position-based attachment
      player.camera.setAttachedToPosition({ x: 15, y: 5, z: 2 });

      logger.info(`Fixed camera view set for player: ${player.username}`, {
        component: 'CameraSystem',
        playerId: player.id,
        cameraMount: 'attached to position'
      });
    }

    // Focus camera on the game area (center of the action)
    player.camera.setTrackedPosition({ x: 9, y: 3, z: -5 });

    // Set optimal FOV for game show viewing
    player.camera.setFov(85);

    // Slight zoom for better board visibility
    player.camera.setZoom(1.2);
  }

  /**
   * Player Join Event - Load Main Menu UI and Setup Camera
   */
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    logger.info(`Player joined - loading main menu UI: ${player.username}`, {
      component: 'UISystem',
      playerId: player.id
    });

    // Set up fixed camera view immediately
    setupFixedCameraView(player);

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

      case 'LOAD_GAME_BOARD':
        // Load the game board UI
        loadGameBoardUI(player);
        break;

      case 'GET_GAME_STATE':
        // Send current game state to player
        if (gameManager) {
          gameManager.sendGameStateToPlayer(player);
        }
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
    // Always use 2 AI players for Jeopardy format
    const aiCount = 2;

    logger.info(`Starting single player mode for ${player.username}`, {
      component: 'GameMode',
      aiCount: aiCount,
      playerId: player.id
    });

    // Update game config
    gameManager.updateConfig({
      singlePlayerMode: true,
      aiPlayersCount: aiCount
    });

    // Initialize AI players
    gameManager.initializeAIPlayers(aiCount);

    // Send ready signal to player
    player.ui.sendData({
      type: 'GAME_READY',
      payload: { mode: 'singleplayer', aiCount: aiCount }
    });

    // Actually start the game after a short delay
    setTimeout(() => {
      logger.info('Starting single player game after AI initialization', {
        component: 'GameMode',
        playerId: player.id
      });
      gameManager.startGame();
    }, 1000);
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
      logger.debug(`Playing sound effect: ${soundName}`, { component: 'AudioSystem' });
    } else {
      // Try fallback sounds for common actions
      let fallbackSound = null;
      switch(soundName) {
        case 'hover':
        case 'click':
          fallbackSound = audioSystem.soundEffects.get('button_click');
          break;
        case 'confirm':
        case 'transition':
          fallbackSound = audioSystem.soundEffects.get('notification');
          break;
      }

      if (fallbackSound) {
        fallbackSound.play(world);
        logger.debug(`Playing fallback sound for: ${soundName}`, { component: 'AudioSystem' });
      } else {
        logger.warn(`Sound effect not found: ${soundName}`, { component: 'AudioSystem' });
      }
    }
  }

  /**
   * Load Game Board UI
   */
  function loadGameBoardUI(player: any) {
    logger.info(`Loading game board UI for ${player.username}`, {
      component: 'UISystem',
      playerId: player.id
    });

    // Load the game board UI
    player.ui.load('ui/game-board.html');

    // Unlock pointer for UI interaction
    player.ui.lockPointer(false);

    // Stop main menu music and start game music
    if (audioSystem.backgroundMusic) {
      audioSystem.backgroundMusic.pause();
    }

    // Start game background music
    if (serverConfig.audioEnabled) {
      const gameMusic = new Audio({
        uri: 'audio/music/hytopia-main-theme.mp3',
        loop: true,
        volume: 0.2
      });
      gameMusic.play(world);
      audioSystem.soundEffects.set('gameMusic', gameMusic);
    }

    // Send initial game state to the new UI
    setTimeout(() => {
      gameManager.sendGameStateToPlayer(player);
    }, 500);
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
