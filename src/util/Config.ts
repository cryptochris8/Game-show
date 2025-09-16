/**
 * Configuration management for Buzzchain Trivia Game
 * Centralized configuration with validation and type safety
 */

export interface GameConfig {
  // Game settings
  packName: string;
  autoStart: boolean;
  autoHostDelay: number;
  minPlayers: number;
  maxPlayers: number;

  // Timing settings
  clueDisplayTime: number;
  buzzLockoutTime: number;
  buzzWindowTime: number;
  answerTimeLimit: number;
  finalWagerTime: number;
  finalAnswerTime: number;

  // Scoring settings
  maxDailyDoubleWager: number;
  minWager: number;

  // UI settings
  messageDelay: number;
  maxMessageLength: number;
}

export interface ServerConfig {
  // Server settings
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  audioEnabled: boolean;
  audioVolume: number;

  // Environment settings
  port?: number;
  host?: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private gameConfig: GameConfig;
  private serverConfig: ServerConfig;

  private constructor() {
    this.gameConfig = this.getDefaultGameConfig();
    this.serverConfig = this.getDefaultServerConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get the current game configuration
   */
  public getGameConfig(): Readonly<GameConfig> {
    return { ...this.gameConfig };
  }

  /**
   * Get the current server configuration
   */
  public getServerConfig(): Readonly<ServerConfig> {
    return { ...this.serverConfig };
  }

  /**
   * Update game configuration (partial update)
   */
  public updateGameConfig(updates: Partial<GameConfig>): void {
    this.validateGameConfig(updates);
    this.gameConfig = { ...this.gameConfig, ...updates };
  }

  /**
   * Update server configuration (partial update)
   */
  public updateServerConfig(updates: Partial<ServerConfig>): void {
    this.validateServerConfig(updates);
    this.serverConfig = { ...this.serverConfig, ...updates };
  }

  /**
   * Load configuration from environment variables
   */
  public loadFromEnvironment(): void {
    // Game config from env
    if (process.env.BUZZCHAIN_PACK_NAME) {
      this.gameConfig.packName = process.env.BUZZCHAIN_PACK_NAME;
    }

    if (process.env.BUZZCHAIN_AUTO_START) {
      this.gameConfig.autoStart = process.env.BUZZCHAIN_AUTO_START === 'true';
    }

    if (process.env.BUZZCHAIN_AUTO_HOST_DELAY) {
      const delay = parseInt(process.env.BUZZCHAIN_AUTO_HOST_DELAY, 10);
      if (!isNaN(delay) && delay >= 1000) {
        this.gameConfig.autoHostDelay = delay;
      }
    }

    // Server config from env
    if (process.env.BUZZCHAIN_DEBUG_MODE) {
      this.serverConfig.debugMode = process.env.BUZZCHAIN_DEBUG_MODE === 'true';
    }

    if (process.env.BUZZCHAIN_LOG_LEVEL) {
      const logLevel = process.env.BUZZCHAIN_LOG_LEVEL as ServerConfig['logLevel'];
      if (['debug', 'info', 'warn', 'error'].includes(logLevel)) {
        this.serverConfig.logLevel = logLevel;
      }
    }

    if (process.env.BUZZCHAIN_AUDIO_ENABLED) {
      this.serverConfig.audioEnabled = process.env.BUZZCHAIN_AUDIO_ENABLED === 'true';
    }

    if (process.env.BUZZCHAIN_AUDIO_VOLUME) {
      const volume = parseFloat(process.env.BUZZCHAIN_AUDIO_VOLUME);
      if (!isNaN(volume) && volume >= 0 && volume <= 1) {
        this.serverConfig.audioVolume = volume;
      }
    }
  }

  /**
   * Validate game configuration
   */
  private validateGameConfig(config: Partial<GameConfig>): void {
    if (config.minPlayers !== undefined && config.minPlayers < 1) {
      throw new Error('Minimum players must be at least 1');
    }

    if (config.maxPlayers !== undefined && config.maxPlayers > 10) {
      throw new Error('Maximum players cannot exceed 10');
    }

    if (config.minPlayers !== undefined && config.maxPlayers !== undefined &&
        config.minPlayers > config.maxPlayers) {
      throw new Error('Minimum players cannot exceed maximum players');
    }

    if (config.autoHostDelay !== undefined && config.autoHostDelay < 1000) {
      throw new Error('Auto host delay must be at least 1000ms');
    }

    if (config.buzzLockoutTime !== undefined && config.buzzLockoutTime < 100) {
      throw new Error('Buzz lockout time must be at least 100ms');
    }

    if (config.buzzWindowTime !== undefined && config.buzzWindowTime < 1000) {
      throw new Error('Buzz window time must be at least 1000ms');
    }
  }

  /**
   * Validate server configuration
   */
  private validateServerConfig(config: Partial<ServerConfig>): void {
    if (config.audioVolume !== undefined && (config.audioVolume < 0 || config.audioVolume > 1)) {
      throw new Error('Audio volume must be between 0 and 1');
    }

    if (config.port !== undefined && (config.port < 1 || config.port > 65535)) {
      throw new Error('Port must be between 1 and 65535');
    }
  }

  /**
   * Get default game configuration
   */
  private getDefaultGameConfig(): GameConfig {
    return {
      packName: 'trivia_pack',
      autoStart: true,
      autoHostDelay: 15000,
      minPlayers: 2,
      maxPlayers: 6,
      clueDisplayTime: 3000,
      buzzLockoutTime: 300,
      buzzWindowTime: 12000,
      answerTimeLimit: 30000,
      finalWagerTime: 30000,
      finalAnswerTime: 30000,
      maxDailyDoubleWager: 1000,
      minWager: 5,
      messageDelay: 1000,
      maxMessageLength: 500
    };
  }

  /**
   * Get default server configuration
   */
  private getDefaultServerConfig(): ServerConfig {
    return {
      debugMode: false,
      logLevel: 'info',
      audioEnabled: true,
      audioVolume: 0.08
    };
  }

  /**
   * Reset configuration to defaults
   */
  public resetToDefaults(): void {
    this.gameConfig = this.getDefaultGameConfig();
    this.serverConfig = this.getDefaultServerConfig();
  }

  /**
   * Get configuration as JSON for debugging
   */
  public toJSON(): { game: GameConfig; server: ServerConfig } {
    return {
      game: this.gameConfig,
      server: this.serverConfig
    };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();

// Export convenience functions
export const getGameConfig = () => config.getGameConfig();
export const getServerConfig = () => config.getServerConfig();
export const updateGameConfig = (updates: Partial<GameConfig>) => config.updateGameConfig(updates);
export const updateServerConfig = (updates: Partial<ServerConfig>) => config.updateServerConfig(updates);
