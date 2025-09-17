/**
 * Game Constants - Centralized configuration values
 * All magic numbers and configuration constants in one place
 */

// Player limits
export const GAME_CONSTANTS = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 6,
    MIN_AI_PLAYERS: 1,
    MAX_AI_PLAYERS: 5,
    SINGLE_PLAYER_AI_COUNT: 2, // Always 2 AI for single player (3 total)
} as const;

// Timing constants (in milliseconds)
export const TIMING = {
    BUZZ_LOCKOUT_MS: 300,
    BUZZ_RESPONSE_WINDOW_MS: 12000,
    ANSWER_TIME_LIMIT_MS: 45000,
    DAILY_DOUBLE_WAGER_TIME_MS: 15000,
    FINAL_WAGER_TIME_MS: 20000,
    FINAL_ANSWER_TIME_MS: 30000,
    AUTO_HOST_DELAY_MS: 10000,
    AUTO_START_DELAY_MS: 15000,
    CLUE_DISPLAY_MIN_MS: 2000,
    INTRO_DURATION_MS: 30000,
    PER_PLAYER_INTRO_MS: 5000,
    CAMERA_TRANSITION_MS: 1000,
    UI_UPDATE_DELAY_MS: 500,
    CLEANUP_INTERVAL_MS: 60000,
    RATE_LIMIT_WINDOW_MS: 1000,
} as const;

// Score values
export const SCORES = {
    ROUND_1_VALUES: [100, 200, 300, 400, 500],
    ROUND_2_MULTIPLIER: 2,
    MIN_WAGER: 0,
    MIN_FINAL_WAGER: 0,
    DEFAULT_DAILY_DOUBLE_WAGER: 1000,
} as const;

// Board configuration
export const BOARD = {
    CATEGORIES_COUNT: 6,
    CLUES_PER_CATEGORY: 5,
    DAILY_DOUBLES_ROUND_1: 1,
    DAILY_DOUBLES_ROUND_2: 2,
    MAX_DAILY_DOUBLES: 3,
} as const;

// UI Configuration
export const UI = {
    MAX_CHAT_MESSAGE_LENGTH: 200,
    MAX_ANSWER_LENGTH: 200,
    MAX_USERNAME_LENGTH: 30,
    MIN_USERNAME_LENGTH: 1,
    LEADERBOARD_SIZE: 10,
    MOBILE_BREAKPOINT_PX: 768,
    ANIMATION_DURATION_MS: 300,
    TOAST_DURATION_MS: 3000,
} as const;

// Audio Configuration
export const AUDIO = {
    MUSIC_VOLUME: 0.3,
    SFX_VOLUME: 0.5,
    BUTTON_CLICK_VOLUME: 0.4,
    CORRECT_ANSWER_VOLUME: 0.6,
    INCORRECT_ANSWER_VOLUME: 0.5,
    BUZZ_VOLUME: 0.7,
    FINAL_ROUND_MUSIC_VOLUME: 0.25,
} as const;

// Camera Configuration
export const CAMERA = {
    DEFAULT_FOV: 85,
    DEFAULT_ZOOM: 1.2,
    INTRO_FOV: 70,
    CLOSEUP_FOV: 50,
    WIDE_FOV: 90,
    MIN_ZOOM: 0.5,
    MAX_ZOOM: 2.0,
    // Fixed camera position for game view
    GAME_VIEW_POSITION: { x: 15, y: 5, z: 2 },
    GAME_VIEW_TARGET: { x: 9, y: 3, z: -5 },
    // Host camera position
    HOST_VIEW_POSITION: { x: 9, y: 6, z: 3 },
    HOST_VIEW_TARGET: { x: 9, y: 4, z: -1 },
} as const;

// Podium Positions (matching the game layout)
export const PODIUM_POSITIONS = {
    PLAYER_1: { x: 4, y: 4, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    PLAYER_2: { x: 9, y: 4, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    PLAYER_3: { x: 14, y: 4, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    HOST: { x: 9, y: 4, z: -1, rotation: { x: 0, y: 1, z: 0, w: 0 } },
} as const;

// Rate Limiting
export const RATE_LIMITS = {
    BUZZ_MAX_CALLS: 3,
    BUZZ_WINDOW_MS: 1000,
    ANSWER_MAX_CALLS: 2,
    ANSWER_WINDOW_MS: 1000,
    CHAT_MAX_CALLS: 5,
    CHAT_WINDOW_MS: 3000,
    UI_EVENT_MAX_CALLS: 10,
    UI_EVENT_WINDOW_MS: 1000,
} as const;

// AI Configuration
export const AI_CONFIG = {
    REACTION_TIME_MIN_MS: 500,
    REACTION_TIME_MAX_MS: 3000,
    THINK_TIME_MIN_MS: 1000,
    THINK_TIME_MAX_MS: 5000,
    BUZZ_CONFIDENCE_THRESHOLD: 0.7,
    DAILY_DOUBLE_AGGRESSIVE_THRESHOLD: 0.8,
    FINAL_WAGER_CONSERVATIVE_RATIO: 0.3,
    FINAL_WAGER_AGGRESSIVE_RATIO: 0.7,
} as const;

// Network Configuration
export const NETWORK = {
    RECONNECT_TIMEOUT_MS: 30000,
    HEARTBEAT_INTERVAL_MS: 5000,
    MAX_PACKET_SIZE: 65536,
    SYNC_INTERVAL_MS: 100,
} as const;

// Persistence Configuration
export const PERSISTENCE = {
    SAVE_INTERVAL_MS: 30000,
    STATS_CACHE_TTL_MS: 300000, // 5 minutes
    LEADERBOARD_CACHE_TTL_MS: 60000, // 1 minute
    MAX_STORED_GAMES: 100,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please slow down.',
    INVALID_ANSWER: 'Invalid answer format. Please try again.',
    INVALID_WAGER: 'Invalid wager amount.',
    GAME_FULL: 'Game is full. Maximum players reached.',
    NOT_YOUR_TURN: 'It\'s not your turn to select.',
    ALREADY_BUZZED: 'You have already buzzed for this question.',
    BUZZ_LOCKED: 'Buzz is locked. Another player is answering.',
    GAME_NOT_STARTED: 'Game has not started yet.',
    UNAUTHORIZED: 'You are not authorized to perform this action.',
    SESSION_EXPIRED: 'Your session has expired. Please rejoin.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
    CORRECT_ANSWER: '✅ Correct!',
    GAME_STARTED: '🎮 Game started!',
    PLAYER_JOINED: 'joined the game!',
    WAGER_SUBMITTED: 'Wager submitted!',
    BUZZ_REGISTERED: 'Buzzed in!',
} as const;

// Default Configuration
export const DEFAULT_CONFIG = {
    PACK_NAME: 'trivia_pack',
    AUTO_START: true,
    SKIP_INTRO: false,
    DEBUG_MODE: false,
    AUDIO_ENABLED: true,
} as const;

// Export type for TypeScript
export type GameConstantsType = typeof GAME_CONSTANTS;
export type TimingType = typeof TIMING;
export type ScoresType = typeof SCORES;
export type BoardType = typeof BOARD;