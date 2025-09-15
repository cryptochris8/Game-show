// PodiumManager - Manages player positioning at podiums for Jeopardy-style gameplay
// Handles 3 contestant podiums and 1 host podium using HYTOPIA SDK

import { Player, World, Entity, RigidBodyType } from 'hytopia';
import { logger } from '../util/Logger';

export interface PodiumPosition {
    x: number;
    y: number;
    z: number;
    rotation?: { x: number; y: number; z: number; w: number };
}

export interface HostPersonality {
    name: string;
    model: string;  // NPC model identifier
    greeting: string;
    style: 'formal' | 'casual' | 'comedic';
}

export class PodiumManager {
    private world: World;
    private hostEntity: Entity | null = null;
    private playerPodiums: Map<number, PodiumPosition> = new Map();
    private hostPodium: PodiumPosition;
    private podiumAssignments: Map<string, number> = new Map(); // playerId -> podium number
    private currentHost: HostPersonality | null = null;

    // Podium positions for 3 contestants and 1 host
    // These match your actual map's podium locations
    private readonly CONTESTANT_PODIUMS: PodiumPosition[] = [
        { x: 4, y: 3, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } },     // Left podium
        { x: 9, y: 3, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } },     // Center podium
        { x: 14, y: 3, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } }     // Right podium
    ];

    private readonly HOST_PODIUM: PodiumPosition = {
        x: 9, y: 3, z: -1,  // Host stands opposite contestants
        rotation: { x: 0, y: 1, z: 0, w: 0 }  // Facing contestants
    };

    // Available host personalities - using standard HYTOPIA NPC models
    private readonly HOST_PERSONALITIES: HostPersonality[] = [
        {
            name: "Professor Buzzy",
            model: "bee-adult",
            greeting: "Welcome to Clueboard! I'm Professor Buzzy, your buzzing host!",
            style: 'formal'
        },
        {
            name: "Quiz Master Ocelot",
            model: "ocelot",
            greeting: "Greetings contestants! Quiz Master Ocelot at your service!",
            style: 'casual'
        },
        {
            name: "Trivia Rabbit",
            model: "rabbit",
            greeting: "Hop hop! Trivia Rabbit here to test your knowledge!",
            style: 'comedic'
        },
        {
            name: "Knowledge Spider",
            model: "spider",
            greeting: "Welcome to my web of questions! I'm Knowledge Spider!",
            style: 'formal'
        }
    ];

    constructor(world: World) {
        this.world = world;
        this.hostPodium = this.HOST_PODIUM;

        // Initialize contestant podium positions
        this.CONTESTANT_PODIUMS.forEach((pos, index) => {
            this.playerPodiums.set(index + 1, pos);
        });
    }

    /**
     * Initialize the host NPC with a random personality
     */
    public spawnHost(): Entity | null {
        try {
            // Select random host personality
            this.currentHost = this.HOST_PERSONALITIES[
                Math.floor(Math.random() * this.HOST_PERSONALITIES.length)
            ];

            // Create host NPC entity
            this.hostEntity = new Entity({
                name: this.currentHost.name,
                modelUri: `models/npcs/${this.currentHost.model}.gltf`,
                modelScale: 1.2,
                rigidBodyOptions: {
                    type: RigidBodyType.FIXED
                }
            });

            // Spawn host at podium
            this.hostEntity.spawn(this.world, this.hostPodium);

            logger.info(`Host ${this.currentHost.name} spawned at host podium`, {
                component: 'PodiumManager',
                host: this.currentHost.name,
                model: this.currentHost.model,
                position: this.hostPodium
            });

            // Make host face the contestants
            if (this.hostPodium.rotation) {
                this.hostEntity.setRotation(this.hostPodium.rotation);
            }

            return this.hostEntity;
        } catch (error) {
            logger.error('Failed to spawn host', error as Error, {
                component: 'PodiumManager'
            });
            return null;
        }
    }

    /**
     * Assign a player to a specific podium
     */
    public assignPlayerToPodium(player: Player, podiumNumber: number): boolean {
        if (podiumNumber < 1 || podiumNumber > 3) {
            logger.warn('Invalid podium number', {
                component: 'PodiumManager',
                podiumNumber,
                playerId: player.id
            });
            return false;
        }

        const position = this.playerPodiums.get(podiumNumber);
        if (!position) {
            return false;
        }

        try {
            // Teleport player to podium by setting entity position
            if (player.entity) {
                player.entity.setPosition(position);

                // Lock player movement during game (if player entity supports it)
                if (typeof player.entity.setIsMovementDisabled === 'function') {
                    player.entity.setIsMovementDisabled(true);
                }
            }

            // Store assignment
            this.podiumAssignments.set(player.id, podiumNumber);

            logger.info(`Player assigned to podium ${podiumNumber}`, {
                component: 'PodiumManager',
                playerId: player.id,
                playerName: player.username,
                podiumNumber,
                position
            });

            return true;
        } catch (error) {
            logger.error('Failed to assign player to podium', error as Error, {
                component: 'PodiumManager',
                playerId: player.id,
                podiumNumber
            });
            return false;
        }
    }

    /**
     * Assign AI player entity to a podium
     */
    public assignAIToPodium(aiEntity: Entity, podiumNumber: number): boolean {
        if (podiumNumber < 1 || podiumNumber > 3) {
            return false;
        }

        const position = this.playerPodiums.get(podiumNumber);
        if (!position) {
            return false;
        }

        try {
            // Set AI entity position
            aiEntity.setPosition(position);

            // Make AI face forward
            if (position.rotation) {
                aiEntity.setRotation(position.rotation);
            }

            // Store assignment using entity ID as key
            this.podiumAssignments.set(aiEntity.id, podiumNumber);

            logger.info(`AI assigned to podium ${podiumNumber}`, {
                component: 'PodiumManager',
                podiumNumber,
                position
            });

            return true;
        } catch (error) {
            logger.error('Failed to assign AI to podium', error as Error, {
                component: 'PodiumManager',
                podiumNumber
            });
            return false;
        }
    }

    /**
     * Get the next available podium number
     */
    public getNextAvailablePodium(): number | null {
        for (let i = 1; i <= 3; i++) {
            const isOccupied = Array.from(this.podiumAssignments.values()).includes(i);
            if (!isOccupied) {
                return i;
            }
        }
        return null;
    }

    /**
     * Release a player from their podium (allow movement)
     */
    public releasePlayer(player: Player): void {
        try {
            // Re-enable player movement (if player entity supports it)
            if (player.entity && typeof player.entity.setIsMovementDisabled === 'function') {
                player.entity.setIsMovementDisabled(false);
            }
            this.podiumAssignments.delete(player.id);

            logger.info('Player released from podium', {
                component: 'PodiumManager',
                playerId: player.id
            });
        } catch (error) {
            logger.error('Failed to release player', error as Error, {
                component: 'PodiumManager',
                playerId: player.id
            });
        }
    }

    /**
     * Release all players (end of game)
     */
    public releaseAllPlayers(players: Map<string, Player>): void {
        players.forEach((player) => {
            this.releasePlayer(player);
        });
    }

    /**
     * Get current host information
     */
    public getCurrentHost(): HostPersonality | null {
        return this.currentHost;
    }

    /**
     * Make host perform an animation
     */
    public animateHost(animation: string): void {
        if (this.hostEntity && this.hostEntity.isSpawned) {
            try {
                this.hostEntity.playAnimation(animation, { loop: false });
            } catch (error) {
                logger.warn('Failed to animate host', {
                    component: 'PodiumManager',
                    animation,
                    error
                });
            }
        }
    }

    /**
     * Get host greeting message
     */
    public getHostGreeting(): string {
        return this.currentHost ? this.currentHost.greeting : "Welcome to the game!";
    }

    /**
     * Update podium positions based on your actual map
     * Call this if you need to adjust positions for your specific map
     */
    public updatePodiumPositions(
        contestantPodiums: PodiumPosition[],
        hostPodium: PodiumPosition
    ): void {
        if (contestantPodiums.length === 3) {
            contestantPodiums.forEach((pos, index) => {
                this.playerPodiums.set(index + 1, pos);
            });
        }
        this.hostPodium = hostPodium;

        logger.info('Podium positions updated', {
            component: 'PodiumManager',
            contestantPodiums,
            hostPodium
        });
    }
}

export default PodiumManager;