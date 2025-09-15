/**
 * Player Manager for Clueboard Trivia Game
 * Handles player lifecycle events and entity management
 */

import { Player, World, DefaultPlayerEntity, PlayerEvent } from 'hytopia';
import { logger } from './Logger';
import { getGameConfig } from './Config';

export interface PlayerJoinContext {
  player: Player;
  world: World;
  entity: DefaultPlayerEntity;
  joinTime: number;
}

export interface PlayerLeaveContext {
  player: Player;
  world: World;
  entity: DefaultPlayerEntity | null;
  joinTime: number;
  leaveTime: number;
  sessionDuration: number;
}

export class PlayerLifecycleManager {
  private world: World;
  private playerEntities: Map<string, DefaultPlayerEntity> = new Map();
  private playerJoinTimes: Map<string, number> = new Map();
  private welcomeMessages: string[] = [
    '🎯 Welcome to CLUEBOARD!',
    'A Jeopardy-style trivia game',
    'Use WASD to move around the lobby while playing',
    'Game will start automatically when enough players join!'
  ];

  constructor(world: World) {
    this.world = world;
    this.setupEventHandlers();
  }

  /**
   * Setup player event handlers
   */
  private setupEventHandlers(): void {
    this.world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
      this.handlePlayerJoined(player);
    });

    this.world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
      this.handlePlayerLeft(player);
    });
  }

  /**
   * Handle player joining the world
   */
  private async handlePlayerJoined(player: Player): Promise<void> {
    const joinTime = Date.now();

    try {
      logger.info(`Player joined: ${player.username} (${player.id})`, {
        component: 'PlayerLifecycleManager',
        playerId: player.id,
        username: player.username
      });

      // Create player entity
      const playerEntity = new DefaultPlayerEntity({
        player,
        name: player.username || 'Player',
      });

      // Spawn entity at random position in lobby
      const spawnPosition = this.getRandomSpawnPosition();
      playerEntity.spawn(this.world, spawnPosition);

      // Store references
      this.playerEntities.set(player.id, playerEntity);
      this.playerJoinTimes.set(player.id, joinTime);

      // CRITICAL FIX: Link entity to player object for podium assignment
      (player as any).entity = playerEntity;

      logger.info(`Entity linked to player object for podium assignment`, {
        component: 'PlayerLifecycleManager',
        playerId: player.id,
        username: player.username,
        entityId: playerEntity.id,
        entityLinked: !!(player as any).entity
      });

      // Send welcome messages
      this.sendWelcomeMessages(player);

      // Create context for external handlers
      const context: PlayerJoinContext = {
        player,
        world: this.world,
        entity: playerEntity,
        joinTime
      };

      // Emit custom event for game manager
      this.world.emit('playerJoined', player);
      this.world.emit('playerEntityCreated', context);

      logger.playerAction(player.id, 'join_world', {
        entityId: playerEntity.id,
        spawnPosition
      });

    } catch (error) {
      logger.error('Failed to handle player join', error as Error, {
        component: 'PlayerLifecycleManager',
        playerId: player.id,
        username: player.username
      });

      // Clean up on error
      this.playerEntities.delete(player.id);
      this.playerJoinTimes.delete(player.id);
      delete (player as any).entity;
    }
  }

  /**
   * Handle player leaving the world
   */
  private async handlePlayerLeft(player: Player): Promise<void> {
    const leaveTime = Date.now();
    const joinTime = this.playerJoinTimes.get(player.id) || leaveTime;
    const sessionDuration = leaveTime - joinTime;

    try {
      logger.info(`Player left: ${player.username} (${player.id})`, {
        component: 'PlayerLifecycleManager',
        playerId: player.id,
        username: player.username,
        sessionDurationMs: sessionDuration
      });

      // Get player entity
      const playerEntity = this.playerEntities.get(player.id);

      // Despawn entity if it exists
      if (playerEntity) {
        playerEntity.despawn();
        this.playerEntities.delete(player.id);
      }

      // Clean up join time
      this.playerJoinTimes.delete(player.id);

      // Clean up entity reference from player object
      delete (player as any).entity;

      // Create context for external handlers
      const context: PlayerLeaveContext = {
        player,
        world: this.world,
        entity: playerEntity || null,
        joinTime,
        leaveTime,
        sessionDuration
      };

      // Emit custom event for game manager
      this.world.emit('playerLeft', player);
      this.world.emit('playerEntityDestroyed', context);

      logger.playerAction(player.id, 'leave_world', {
        sessionDurationMs: sessionDuration,
        hadEntity: !!playerEntity
      });

    } catch (error) {
      logger.error('Failed to handle player leave', error as Error, {
        component: 'PlayerLifecycleManager',
        playerId: player.id,
        username: player.username
      });
    }
  }

  /**
   * Send welcome messages to new player
   */
  private sendWelcomeMessages(player: Player): void {
    const config = getGameConfig();
    const messageDelay = config.messageDelay;

    this.welcomeMessages.forEach((message, index) => {
      setTimeout(() => {
        const color = this.getMessageColor(index);
        try {
          this.world.chatManager.sendPlayerMessage(player, message, color);
        } catch (error) {
          // Fallback without color if there's an issue
          this.world.chatManager.sendPlayerMessage(player, message);
        }
      }, index * messageDelay);
    });
  }

  /**
   * Get message color based on index
   */
  private getMessageColor(index: number): string {
    const colors = ['FFD700', '4A90E2', 'FFFFFF', '00FF00']; // Without # for HYTOPIA API
    const color = colors[index] || 'FFFFFF';
    // Ensure color is uppercase for consistency
    return color.toUpperCase();
  }

  /**
   * Get random spawn position in lobby
   */
  private getRandomSpawnPosition(): { x: number; y: number; z: number } {
    // Create a circular spawn area around the center
    const angle = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 3; // Random radius between 2-5

    return {
      x: Math.cos(angle) * radius,
      y: 10, // Fixed height
      z: Math.sin(angle) * radius
    };
  }

  /**
   * Get player entity by player ID
   */
  public getPlayerEntity(playerId: string): DefaultPlayerEntity | undefined {
    return this.playerEntities.get(playerId);
  }

  /**
   * Get all player entities
   */
  public getAllPlayerEntities(): Map<string, DefaultPlayerEntity> {
    return new Map(this.playerEntities);
  }

  /**
   * Get player join time
   */
  public getPlayerJoinTime(playerId: string): number | undefined {
    return this.playerJoinTimes.get(playerId);
  }

  /**
   * Get player session duration
   */
  public getPlayerSessionDuration(playerId: string): number {
    const joinTime = this.playerJoinTimes.get(playerId);
    if (!joinTime) return 0;

    return Date.now() - joinTime;
  }

  /**
   * Check if player is currently in the world
   */
  public isPlayerActive(playerId: string): boolean {
    return this.playerEntities.has(playerId);
  }

  /**
   * Get player count
   */
  public getPlayerCount(): number {
    return this.playerEntities.size;
  }

  /**
   * Get player statistics
   */
  public getPlayerStats(): {
    totalPlayers: number;
    activePlayers: number;
    averageSessionDuration: number;
  } {
    const totalPlayers = this.playerEntities.size;
    const sessionDurations = Array.from(this.playerJoinTimes.values())
      .map(joinTime => Date.now() - joinTime);

    const averageSessionDuration = sessionDurations.length > 0
      ? sessionDurations.reduce((sum, duration) => sum + duration, 0) / sessionDurations.length
      : 0;

    return {
      totalPlayers,
      activePlayers: totalPlayers,
      averageSessionDuration
    };
  }

  /**
   * Force despawn all player entities (for cleanup)
   */
  public despawnAllEntities(): void {
    logger.info('Despawning all player entities', {
      component: 'PlayerLifecycleManager',
      entityCount: this.playerEntities.size
    });

    for (const [playerId, entity] of this.playerEntities.entries()) {
      try {
        entity.despawn();
        logger.debug(`Despawned entity for player ${playerId}`, {
          component: 'PlayerLifecycleManager',
          playerId
        });
      } catch (error) {
        logger.error(`Failed to despawn entity for player ${playerId}`, error as Error, {
          component: 'PlayerLifecycleManager',
          playerId
        });
      }
    }

    this.playerEntities.clear();
    this.playerJoinTimes.clear();
  }

  /**
   * Update welcome messages
   */
  public setWelcomeMessages(messages: string[]): void {
    this.welcomeMessages = [...messages];
  }
}
