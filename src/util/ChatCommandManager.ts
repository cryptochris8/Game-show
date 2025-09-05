/**
 * Chat Command Manager for Clueboard Trivia Game
 * Handles registration and execution of chat commands
 */

import { Player, World } from 'hytopia';
import { logger } from './Logger';

export interface ChatCommand {
  name: string;
  description: string;
  usage?: string;
  handler: (player: Player, args: string[], world: World) => void | Promise<void>;
  requiresPermission?: boolean;
  cooldown?: number; // in milliseconds
}

export interface CommandContext {
  player: Player;
  world: World;
  command: string;
  args: string[];
  timestamp: number;
}

export class ChatCommandManager {
  private commands: Map<string, ChatCommand> = new Map();
  private playerCooldowns: Map<string, Map<string, number>> = new Map();

  /**
   * Register a new chat command
   */
  public register(command: ChatCommand): void {
    if (this.commands.has(command.name)) {
      logger.warn(`Chat command '${command.name}' is being overwritten`, {
        component: 'ChatCommandManager',
        command: command.name
      });
    }

    this.commands.set(command.name, command);
    logger.info(`Registered chat command: ${command.name}`, {
      component: 'ChatCommandManager',
      command: command.name,
      description: command.description
    });
  }

  /**
   * Register multiple commands at once
   */
  public registerMultiple(commands: ChatCommand[]): void {
    commands.forEach(command => this.register(command));
  }

  /**
   * Execute a chat command
   */
  public async execute(commandName: string, player: Player, args: string[], world: World): Promise<void> {
    const command = this.commands.get(commandName);

    if (!command) {
      this.sendErrorMessage(player, world, `Unknown command: ${commandName}`);
      return;
    }

    // Check cooldown
    if (this.isOnCooldown(player.id, commandName)) {
      const remainingTime = this.getCooldownRemaining(player.id, commandName);
      this.sendErrorMessage(player, world, `Command on cooldown. Try again in ${remainingTime} seconds.`);
      return;
    }

    // Check permissions (if required)
    if (command.requiresPermission) {
      // Add permission checking logic here if needed
      // For now, all commands are available to all players
    }

    const context: CommandContext = {
      player,
      world,
      command: commandName,
      args,
      timestamp: Date.now()
    };

    try {
      logger.playerAction(player.id, `chat_command_${commandName}`, {
        args: args.join(' '),
        component: 'ChatCommandManager'
      });

      await command.handler(player, args, world);

      // Set cooldown if specified
      if (command.cooldown) {
        this.setCooldown(player.id, commandName, command.cooldown);
      }

    } catch (error) {
      logger.error(`Error executing command '${commandName}'`, error as Error, {
        component: 'ChatCommandManager',
        playerId: player.id,
        command: commandName,
        args: args.join(' ')
      });

      this.sendErrorMessage(player, world, `An error occurred while executing command '${commandName}'`);
    }
  }

  /**
   * Get all registered commands
   */
  public getCommands(): Map<string, ChatCommand> {
    return new Map(this.commands);
  }

  /**
   * Get a specific command
   */
  public getCommand(name: string): ChatCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Check if a command exists
   */
  public hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Remove a command
   */
  public removeCommand(name: string): boolean {
    const removed = this.commands.delete(name);
    if (removed) {
      logger.info(`Removed chat command: ${name}`, {
        component: 'ChatCommandManager'
      });
    }
    return removed;
  }

  /**
   * Get help text for all commands
   */
  public getHelpText(): string {
    const commands = Array.from(this.commands.values());
    const commandList = commands.map(cmd => {
      const usage = cmd.usage ? ` ${cmd.usage}` : '';
      return `/${cmd.name}${usage} - ${cmd.description}`;
    }).join('\n');

    return `Available commands:\n${commandList}`;
  }

  /**
   * Send help message to player
   */
  public sendHelpMessage(player: Player, world: World): void {
    const helpText = this.getHelpText();
    try {
      world.chatManager.sendPlayerMessage(player, helpText, '4A90E2');
    } catch (error) {
      // Fallback without color if there's an issue
      world.chatManager.sendPlayerMessage(player, helpText);
    }
  }

  /**
   * Send error message to player
   */
  private sendErrorMessage(player: Player, world: World, message: string): void {
    try {
      world.chatManager.sendPlayerMessage(player, `❌ ${message}`, 'FF6B6B');
    } catch (error) {
      // Fallback without color if there's an issue
      world.chatManager.sendPlayerMessage(player, `❌ ${message}`);
    }
  }

  /**
   * Check if player is on cooldown for a command
   */
  private isOnCooldown(playerId: string, commandName: string): boolean {
    const playerCooldowns = this.playerCooldowns.get(playerId);
    if (!playerCooldowns) return false;

    const cooldownEnd = playerCooldowns.get(commandName);
    if (!cooldownEnd) return false;

    return Date.now() < cooldownEnd;
  }

  /**
   * Get remaining cooldown time in seconds
   */
  private getCooldownRemaining(playerId: string, commandName: string): number {
    const playerCooldowns = this.playerCooldowns.get(playerId);
    if (!playerCooldowns) return 0;

    const cooldownEnd = playerCooldowns.get(commandName);
    if (!cooldownEnd) return 0;

    const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
    return Math.max(0, remaining);
  }

  /**
   * Set cooldown for a player and command
   */
  private setCooldown(playerId: string, commandName: string, cooldownMs: number): void {
    if (!this.playerCooldowns.has(playerId)) {
      this.playerCooldowns.set(playerId, new Map());
    }

    const playerCooldowns = this.playerCooldowns.get(playerId)!;
    playerCooldowns.set(commandName, Date.now() + cooldownMs);
  }

  /**
   * Clean up expired cooldowns (call periodically)
   */
  public cleanupExpiredCooldowns(): void {
    const now = Date.now();

    for (const [playerId, playerCooldowns] of this.playerCooldowns.entries()) {
      for (const [commandName, cooldownEnd] of playerCooldowns.entries()) {
        if (now > cooldownEnd) {
          playerCooldowns.delete(commandName);
        }
      }

      if (playerCooldowns.size === 0) {
        this.playerCooldowns.delete(playerId);
      }
    }
  }
}

// Export singleton instance
export const chatCommandManager = new ChatCommandManager();

// Export convenience functions
export const registerCommand = (command: ChatCommand) => chatCommandManager.register(command);
export const registerCommands = (commands: ChatCommand[]) => chatCommandManager.registerMultiple(commands);
export const executeCommand = (commandName: string, player: Player, args: string[], world: World) =>
  chatCommandManager.execute(commandName, player, args, world);
