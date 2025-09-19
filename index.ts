/**
 * BUZZCHAIN - The Golden Knowledge Chain Game for HYTOPIA
 *
 * Hosted by Buzzy Bee, keeper of the Golden Knowledge Chain!
 * Every correct answer adds a link to our eternal chain of wisdom.
 * Built on blockchain principles where knowledge is power!
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
import { GamePhase } from './src/net/Events';
import { PlayerLifecycleManager } from './src/util/PlayerManager';
import { ChatCommandManager, registerCommands } from './src/util/ChatCommandManager';
import { config, getServerConfig } from './src/util/Config';
import { logger } from './src/util/Logger';
import { TimerManager } from './src/util/TimerManager';
import { InputValidator } from './src/util/InputValidator';
import { TIMING, CAMERA, AUDIO, GAME_CONSTANTS } from './src/util/GameConstants';

/**
 * Buzzchain Game Server Entry Point
 *
 * Initializes the trivia game world with GameManager and sets up
 * player entities for movement around the game lobby while playing.
 * The main game logic is handled by the GameManager system.
 */

startServer(world => {
  try {
    // Load configuration from environment
    config.loadFromEnvironment();

    const serverConfig = getServerConfig();
    const gameConfig = config.getGameConfig();

    logger.info('🐝 Starting Buzzchain - The Golden Knowledge Chain Game', {
      component: 'Server',
      debugMode: serverConfig.debugMode,
      audioEnabled: serverConfig.audioEnabled,
      packName: gameConfig.packName,
      singlePlayerMode: process.env.SINGLE_PLAYER_MODE === 'true',
      aiPlayersCount: parseInt(process.env.AI_PLAYERS_COUNT || '3')
    });

  /**
   * Initialize Timer Manager for proper cleanup
   */
  const timerManager = new TimerManager('Server');

  /**
   * Debug rendering for development
   */
  if (serverConfig.debugMode) {
    world.simulation.enableDebugRendering(true);
    logger.info('Debug rendering enabled', { component: 'Server' });
  }

  /**
   * Initialize the Buzzchain Game Manager
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
  timerManager.setTimeout('camera-mount-creation', () => {
    try {
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
        position: CAMERA.GAME_VIEW_POSITION
      });
    } catch (error) {
      logger.error('Failed to create camera mount', error as Error, {
        component: 'CameraSystem'
      });
    }
  }, TIMING.UI_UPDATE_DELAY_MS * 2);

  /**
   * Initialize Audio System for Buzzchain Experience
   */
  const audioSystem = {
    backgroundMusic: null as Audio | null,
    soundEffects: new Map<string, Audio>(),
    musicEnabled: true,
    sfxEnabled: true,
    musicIsPlaying: false // Track actual playback state
  };

  // Initialize background music
  if (serverConfig.audioEnabled) {
    try {
      audioSystem.backgroundMusic = new Audio({
        uri: 'audio/music/main-menu.mp3',
        loop: true,
        volume: AUDIO.MUSIC_VOLUME
      });

    logger.info('Loading custom main menu music', {
      component: 'AudioSystem',
      file: 'main-menu.mp3'
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
        try {
          audioSystem.soundEffects.set(sfx.name, new Audio({
            uri: sfx.uri,
            loop: false,
            volume: sfx.volume
          }));
        } catch (error) {
          logger.warn(`Failed to load sound effect: ${sfx.name}`, {
            component: 'AudioSystem',
            uri: sfx.uri,
            error: (error as Error).message
          });
        }
      });

      logger.info('Audio system initialized with music and sound effects', {
        component: 'AudioSystem',
        backgroundMusic: !!audioSystem.backgroundMusic,
        soundEffectsCount: audioSystem.soundEffects.size
      });
    } catch (error) {
      logger.error('Failed to initialize audio system', error as Error, {
        component: 'AudioSystem'
      });
      // Continue without audio
    }
  }

  /**
   * Initialize Player Lifecycle Manager
   * Handles player join/leave events and entity management
   */
  const playerManager = new PlayerLifecycleManager(world);

  /**
   * Load the game world map
   */
  try {
    world.loadMap(worldMap);
    logger.info('Game world map loaded', { component: 'Server' });
  } catch (error) {
    logger.error('Failed to load world map', error as Error, {
      component: 'Server'
    });
    throw error; // This is critical, re-throw
  }

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
        // Always use 2 AI opponents for Buzzchain format (3 total players)
        const aiCount = 2;

        // Enable single player mode
        process.env.SINGLE_PLAYER_MODE = 'true';
        process.env.AI_PLAYERS_COUNT = aiCount.toString();

        world.chatManager.sendPlayerMessage(player,
          `🎮 Single player mode activated! Starting Buzzchain trivia game with ${aiCount} AI opponents.`, '00FF00');

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
    try {
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
        player.camera.setAttachedToPosition(CAMERA.GAME_VIEW_POSITION);

        logger.info(`Fixed camera view set for player: ${player.username}`, {
          component: 'CameraSystem',
          playerId: player.id,
          cameraMount: 'attached to position'
        });
      }

      // Focus camera on the game area (center of the action)
      player.camera.setTrackedPosition(CAMERA.GAME_VIEW_TARGET);

      // Set optimal FOV for game show viewing
      player.camera.setFov(CAMERA.DEFAULT_FOV);

      // Slight zoom for better board visibility
      player.camera.setZoom(CAMERA.DEFAULT_ZOOM);
    } catch (error) {
      logger.error(`Failed to set up camera for player: ${player.username}`, error as Error, {
        component: 'CameraSystem',
        playerId: player.id
      });
      // Camera will use default HYTOPIA settings if setup fails
    }
  }

  /**
   * Player Join Event - Load Main Menu UI and Setup Camera
   */
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    try {
      logger.info(`Player joined - loading intro splash: ${player.username}`, {
        component: 'UISystem',
        playerId: player.id
      });

    // Set up fixed camera view immediately
    setupFixedCameraView(player);

    // Load the intro splash screen first
    player.ui.load('ui/intro-splash.html');

    // Start background music immediately when intro splash loads
    if (audioSystem.backgroundMusic && audioSystem.musicEnabled && !audioSystem.musicIsPlaying) {
      try {
        audioSystem.backgroundMusic.play(world);
        audioSystem.musicIsPlaying = true;
        logger.info(`Background music started for player: ${player.username}`, {
          component: 'AudioSystem',
          playerId: player.id,
          musicFile: 'main-menu.mp3',
          trigger: 'intro-splash-load'
        });
      } catch (error) {
        logger.warn(`Failed to start background music for ${player.username}`, {
          component: 'AudioSystem',
          playerId: player.id,
          error: (error as Error).message
        });
      }
    } else if (audioSystem.musicIsPlaying) {
      logger.info(`Background music already playing for ${player.username}`, {
        component: 'AudioSystem',
        playerId: player.id,
        trigger: 'intro-splash-load'
      });
    }

    // Unlock pointer so they can interact with the menu
    player.ui.lockPointer(false);

    // Set up UI event handler for this player
    player.ui.on(PlayerUIEvent.DATA, ({ data }) => {
      handlePlayerUIEvent(player, data);
    });

      // Send player ID to UI
      player.ui.sendData({
        type: 'PLAYER_ID',
        payload: player.id
      });
    } catch (error) {
      logger.error(`Failed to handle player join for ${player?.username}`, error as Error, {
        component: 'Server',
        playerId: player?.id
      });
    }
  });

  /**
   * Handle UI Events from Players
   */
  function handlePlayerUIEvent(player: any, data: any) {
    try {
      // Validate UI event data
      const validation = InputValidator.validateUIEvent(data.type, data.payload);
      if (!validation.valid) {
        logger.warn('Invalid UI event received', {
          component: 'UISystem',
          playerId: player.id,
          eventType: data.type,
          error: validation.error
        });
        return;
      }

      const sanitizedPayload = validation.sanitizedPayload;
      logger.debug(`Received ${data.type} from ${player.username}`, {
        component: 'UISystem',
        playerId: player.id,
        eventType: data.type
      });

      switch (data.type) {
        case 'LOAD_MAIN_MENU':
          // Load main menu after intro splash
          logger.info(`Loading main menu for player: ${player.username}`, {
            component: 'UISystem',
            playerId: player.id
          });
          player.ui.load('ui/main-menu.html');

          // Music already started when intro splash loaded - no need to restart
          break;

        case 'START_SINGLE_PLAYER':
          startSinglePlayerMode(player, sanitizedPayload);
          break;

        case 'START_MULTIPLAYER':
          startMultiplayerMode(player, sanitizedPayload);
          break;

        case 'TOGGLE_MUSIC':
          togglePlayerMusic(player, sanitizedPayload.enabled);
          break;

        case 'TOGGLE_SFX':
          audioSystem.sfxEnabled = sanitizedPayload.enabled;
          logger.info(`SFX ${sanitizedPayload.enabled ? 'enabled' : 'disabled'} for ${player.username}`);
          break;

        case 'PLAY_SOUND':
          playSound(sanitizedPayload.sound);
          break;

        case 'PLAY_FINAL_MUSIC':
          playFinalRoundMusic();
          break;

        case 'LOAD_GAME_BOARD':
          // Only load game board UI if not in INTRO phase
          const currentPhase = gameManager?.getCurrentGamePhase();
          logger.info(`LOAD_GAME_BOARD event received`, {
            component: 'UISystem',
            playerId: player.id,
            currentPhase: currentPhase,
            willLoad: currentPhase !== GamePhase.INTRO
          });

          if (gameManager && currentPhase !== GamePhase.INTRO) {
            loadGameBoardUI(player);
          } else {
            logger.info(`Delaying game board load - currently in intro sequence`, {
              component: 'UISystem',
              playerId: player.id,
              currentPhase: currentPhase
            });
          }
          break;

        case 'GET_GAME_STATE':
          // Send current game state to player
          if (gameManager) {
            gameManager.sendGameStateToPlayer(player);
          }
          break;

        case 'LOAD_INTRO_OVERLAY':
          // Load the intro overlay UI
          logger.info(`Loading intro overlay for ${player.username}`, {
            component: 'UISystem',
            playerId: player.id
          });

          try {
            player.ui.load('ui/intro-overlay.html');

            // Send the intro data after a short delay
            timerManager.setTimeout(`intro-data-${player.id}`, () => {
              player.ui.sendData({
                type: 'START_INTRO_SEQUENCE',
                payload: sanitizedPayload
              });
            }, 500);
          } catch (error) {
            logger.error('Failed to load intro overlay', error as Error, {
              component: 'UISystem',
              playerId: player.id
            });
          }
          break;

        case 'INTRO_COMPLETE':
          // Intro overlay finished, load game board
          logger.info(`Intro complete for ${player.username}, loading game board`, {
            component: 'UISystem',
            playerId: player.id
          });
          loadGameBoardUI(player);
          break;

        default:
          // Forward other events to GameManager
          if (gameManager) {
            gameManager.handleUIEvent(player, data);
          }
      }
    } catch (error) {
      logger.error('Error handling UI event', error as Error, {
        component: 'UISystem',
        playerId: player.id,
        eventType: data?.type
      });
    }
  }

  /**
   * Start Single Player Mode
   */
  function startSinglePlayerMode(player: any, config: any) {
    try {
      // Always use configured AI count for Buzzchain format
      const aiCount = GAME_CONSTANTS.SINGLE_PLAYER_AI_COUNT;

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
      timerManager.setTimeout('start-single-player', () => {
        logger.info('Starting single player game after AI initialization', {
          component: 'GameMode',
          playerId: player.id
        });
        gameManager.startGame();
      }, TIMING.UI_UPDATE_DELAY_MS * 2);
    } catch (error) {
      logger.error('Failed to start single player mode', error as Error, {
        component: 'GameMode',
        playerId: player.id
      });
      player.ui.sendData({
        type: 'ERROR',
        payload: { message: 'Failed to start single player mode. Please try again.' }
      });
    }
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
      if (enabled && !audioSystem.musicIsPlaying) {
        // Only start music if it's not already playing
        try {
          audioSystem.backgroundMusic.play(world);
          audioSystem.musicIsPlaying = true;
          logger.info(`Music started for ${player.username}`, {
            component: 'AudioSystem',
            playerId: player.id,
            trigger: 'toggle-on'
          });
        } catch (error) {
          logger.warn(`Failed to start music for ${player.username}`, {
            component: 'AudioSystem',
            playerId: player.id,
            error: (error as Error).message
          });
        }
      } else if (!enabled && audioSystem.musicIsPlaying) {
        // Stop music by recreating the audio instance (Hytopia doesn't have pause)
        try {
          // Recreate the audio instance to stop it
          audioSystem.backgroundMusic = new Audio({
            uri: 'audio/music/main-menu.mp3',
            loop: true,
            volume: 0.3
          });
          audioSystem.musicIsPlaying = false;
          logger.info(`Music stopped for ${player.username}`, {
            component: 'AudioSystem',
            playerId: player.id,
            trigger: 'toggle-off'
          });
        } catch (error) {
          logger.warn(`Failed to stop music for ${player.username}`, {
            component: 'AudioSystem',
            playerId: player.id,
            error: (error as Error).message
          });
        }
      }
    }

    logger.info(`Music ${enabled ? 'enabled' : 'disabled'} for ${player.username}`, {
      component: 'AudioSystem',
      playerId: player.id,
      actuallyPlaying: audioSystem.musicIsPlaying,
      settingEnabled: audioSystem.musicEnabled
    });
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
   * Stop all music and clean up audio state
   */
  function stopAllMusic() {
    // Stop background music
    if (audioSystem.backgroundMusic) {
      audioSystem.backgroundMusic.pause();
      audioSystem.musicIsPlaying = false;
    }

    // Stop all tracked music
    const musicKeys = ['gameMusic', 'finalMusic'];
    musicKeys.forEach(key => {
      const music = audioSystem.soundEffects.get(key);
      if (music) {
        music.pause();
        audioSystem.soundEffects.delete(key);
      }
    });

    logger.info('All music stopped and cleaned up', {
      component: 'AudioSystem'
    });
  }

  /**
   * Switch to Final Round Music
   */
  function playFinalRoundMusic() {
    if (!serverConfig.audioEnabled) return;

    // Stop current game music
    const currentGameMusic = audioSystem.soundEffects.get('gameMusic');
    if (currentGameMusic) {
      currentGameMusic.pause();
      audioSystem.soundEffects.delete('gameMusic'); // Remove from tracking
      logger.info('Stopped game music for Final Round', { component: 'AudioSystem' });
    }

    // Only start Final Round music if not already playing
    if (!audioSystem.soundEffects.has('finalMusic')) {
      const finalMusic = new Audio({
        uri: 'audio/music/final-round.mp3',
        loop: true,
        volume: 0.25
      });
      finalMusic.play(world);
      audioSystem.soundEffects.set('finalMusic', finalMusic);

      logger.info('Started Final Round music', {
        component: 'AudioSystem',
        file: 'final-round.mp3'
      });
    } else {
      logger.info('Final Round music already playing', { component: 'AudioSystem' });
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

    // Send player ID to the game board
    setTimeout(() => {
      player.ui.sendData({
        type: 'PLAYER_ID',
        payload: { playerId: player.id }
      });
    }, 100);

    // Stop all existing music before starting game music
    stopAllMusic();

    // Start game background music (only if not already playing)
    if (serverConfig.audioEnabled && !audioSystem.soundEffects.has('gameMusic')) {
      const gameMusic = new Audio({
        uri: 'audio/music/game-background.mp3',
        loop: true,
        volume: 0.2
      });
      gameMusic.play(world);
      audioSystem.soundEffects.set('gameMusic', gameMusic);

      logger.info('Started game background music', {
        component: 'AudioSystem',
        file: 'game-background.mp3'
      });
    } else if (audioSystem.soundEffects.has('gameMusic')) {
      logger.info('Game music already playing, not starting another instance', {
        component: 'AudioSystem'
      });
    }

    // Send initial game state to the new UI
    setTimeout(() => {
      gameManager.sendGameStateToPlayer(player);
    }, 500);
  }

  // Setup chat command handler
  world.on('playerMessage', (data: any) => {
    try {
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
    } catch (error) {
      logger.error('Error handling chat message', error as Error, {
        component: 'Chat'
      });
    }
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
  timerManager.setInterval('cleanup-cooldowns', () => {
    chatCommandManager.cleanupExpiredCooldowns();
  }, TIMING.CLEANUP_INTERVAL_MS);

  /**
   * Server startup complete!
   */
  logger.info('🐝 Buzzchain server started! Buzzy Bee is ready to host!', {
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
    console.log('🐝 Buzzchain server started! The Golden Knowledge Chain awaits!');
    console.log('   Features: 6-category board, Daily Doubles, Final Round');
    console.log('   Players: 2-6 supported with server-authoritative gameplay');
    console.log('   UI: Mobile-responsive overlay with buzz system');
    console.log('   Stats: Persistent player statistics and leaderboards');

    // Setup global error handlers
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in server', error, {
        component: 'Server',
        critical: true
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', reason as Error, {
        component: 'Server',
        promise: promise,
        critical: true
      });
    });

  } catch (error) {
    logger.error('Failed to start Buzzchain server', error as Error, {
      component: 'Server',
      critical: true
    });
    throw error; // Re-throw to let Hytopia handle critical startup errors
  }
});
