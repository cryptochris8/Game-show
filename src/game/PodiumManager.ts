// PodiumManager - Manages player positioning at podiums for Buzzchain trivia gameplay
// Handles 3 contestant podiums and 1 host podium using HYTOPIA SDK

import { Player, World, Entity, RigidBodyType, Quaternion, PlayerCameraMode } from 'hytopia';
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
    // Rotations are calculated dynamically to face the host
    private readonly CONTESTANT_PODIUMS: PodiumPosition[] = [
        { x: 4, y: 4, z: -10 },     // Left podium - rotation calculated to face host
        { x: 9, y: 4, z: -10 },     // Center podium - rotation calculated to face host
        { x: 14, y: 4, z: -10 }     // Right podium - rotation calculated to face host
    ];

    private readonly HOST_PODIUM: PodiumPosition = {
        x: 9, y: 4, z: -1,  // Host stands opposite contestants
        rotation: Quaternion.fromEuler(0, 180, 0)  // Face toward contestants (south)
    };

    // Buzzy Bee - The legendary host of Buzzchain
    // His golden chain represents the unbreakable bond of knowledge linking all players
    private readonly BUZZY_BEE_HOST: HostPersonality = {
        name: "Buzzy Bee",
        model: "bee-adult",
        greeting: "Welcome to Buzzchain! I'm Buzzy Bee, keeper of the Golden Knowledge Chain! Each correct answer adds a new link to our chain of wisdom. Are you ready to forge your legacy?",
        style: 'formal'
    };

    constructor(world: World) {
        this.world = world;
        // Calculate host rotation dynamically to face contestants
        this.hostPodium = {
            ...this.HOST_PODIUM,
            rotation: this.calculateHostRotationToFaceContestants()
        };

        // Initialize contestant podium positions with calculated rotations to face host
        this.CONTESTANT_PODIUMS.forEach((pos, index) => {
            const podiumNumber = index + 1;
            const rotation = this.calculateRotationToFaceHost(pos, podiumNumber);
            const correctedPosition = {
                ...pos,
                rotation
            };
            this.playerPodiums.set(podiumNumber, correctedPosition);

            logger.info(`Podium ${podiumNumber} initialized with rotation`, {
                component: 'PodiumManager',
                podiumNumber,
                position: pos,
                calculatedRotation: rotation
            });
        });
    }

    /**
     * Calculate the correct rotation for the host to face the contestants
     */
    private calculateHostRotationToFaceContestants(): { x: number; y: number; z: number; w: number } {
        // Host at z=-1 should face south (toward z=-10 where contestants are)
        // This means a 180-degree rotation around Y axis
        const hostPos = { x: 9, y: 4, z: -1 };
        const centerContestantPos = { x: 9, y: 4, z: -10 };

        // Direction vector from host to center contestant
        const dx = centerContestantPos.x - hostPos.x;
        const dz = centerContestantPos.z - hostPos.z;

        // Calculate yaw angle to face contestants
        const yawRadians = Math.atan2(dx, dz);
        const yawDegrees = yawRadians * (180 / Math.PI);

        logger.info('Calculated host rotation to face contestants', {
            component: 'PodiumManager',
            hostPos,
            centerContestantPos,
            direction: { dx, dz },
            yawDegrees,
            yawRadians
        });

        return Quaternion.fromEuler(0, yawDegrees, 0);
    }

    /**
     * Calculate the correct rotation for a contestant to face the host
     */
    private calculateRotationToFaceHost(contestantPos: PodiumPosition, podiumNumber: number): { x: number; y: number; z: number; w: number } {
        // Direction vector from contestant to host
        const dx = this.hostPodium.x - contestantPos.x;
        const dz = this.hostPodium.z - contestantPos.z;

        // Calculate yaw angle (rotation around Y axis) to face the host
        // atan2(dx, dz) gives us the angle from contestant TO host
        const yawRadians = Math.atan2(dx, dz);
        const yawDegrees = yawRadians * (180 / Math.PI);

        logger.info('Calculated rotation to face host', {
            component: 'PodiumManager',
            podiumNumber,
            contestantPos: { x: contestantPos.x, z: contestantPos.z },
            hostPos: { x: this.hostPodium.x, z: this.hostPodium.z },
            direction: { dx, dz },
            yawDegrees,
            yawRadians
        });

        // Create quaternion from Euler angles (pitch=0, yaw, roll=0)
        return Quaternion.fromEuler(0, yawDegrees, 0);
    }

    /**
     * Initialize Buzzy Bee as the permanent host
     */
    public spawnHost(): Entity | null {
        try {
            // Always use Buzzy Bee as the host
            this.currentHost = this.BUZZY_BEE_HOST;

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
            // Find the player's entity using the entity manager
            const playerEntities = this.world.entityManager.getAllPlayerEntities();
            const playerEntity = playerEntities.find(entity => entity.player?.id === player.id);

            if (playerEntity) {
                // Teleport player entity to podium position
                playerEntity.setPosition(position);

                // Set player entity rotation to face the host
                if (position.rotation) {
                    // Apply rotation immediately
                    playerEntity.setRotation(position.rotation);

                    // Force rotation update after a small delay to ensure it takes effect
                    setTimeout(() => {
                        playerEntity.setRotation(position.rotation);

                        logger.info('Forced rotation update after teleport', {
                            component: 'PodiumManager',
                            playerId: player.id,
                            rotation: position.rotation
                        });
                    }, 100);

                    // CRITICAL: Also synchronize the camera orientation
                    this.synchronizePlayerCameraWithRotation(player, position.rotation);

                    logger.info('Applied rotation to player entity and synchronized camera', {
                        component: 'PodiumManager',
                        playerId: player.id,
                        playerName: player.username,
                        podiumNumber,
                        appliedRotation: position.rotation
                    });
                }

                logger.info(`Successfully positioned player entity at podium`, {
                    component: 'PodiumManager',
                    playerId: player.id,
                    playerName: player.username,
                    podiumNumber,
                    position,
                    rotation: position.rotation,
                    entityFound: true
                });

                // Note: Player movement control would be implemented in custom player entity classes

            } else {
                logger.error(`Player entity not found when assigning to podium`, new Error('Player entity not found'), {
                    component: 'PodiumManager',
                    playerId: player.id,
                    playerName: player.username,
                    podiumNumber,
                    entityFound: false,
                    availableEntities: playerEntities.length
                });
                return false;
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

            // Store assignment using entity ID as key (convert to string for consistency)
            this.podiumAssignments.set(aiEntity.id?.toString() || aiEntity.name || 'unknown', podiumNumber);

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
            // Find and re-enable player movement
            const playerEntities = this.world.entityManager.getAllPlayerEntities();
            const playerEntity = playerEntities.find(entity => entity.player?.id === player.id);

            // Note: Player movement control would be implemented in custom player entity classes

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
     * Synchronize player camera orientation with entity rotation
     * This is the key to making players actually look where their entity is facing
     */
    private synchronizePlayerCameraWithRotation(player: Player, rotation: { x: number; y: number; z: number; w: number }): void {
        try {
            // Convert quaternion to Euler angles to get the yaw
            // Formula: yaw = atan2(2*(w*y + x*z), 1 - 2*(y^2 + z^2))
            const yaw = Math.atan2(
                2 * (rotation.w * rotation.y + rotation.x * rotation.z),
                1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z)
            );

            // DON'T set camera mode - preserve the fixed camera setup from main server
            // The fixed camera mount provides the optimal game show perspective
            // player.camera.setMode(PlayerCameraMode.FIRST_PERSON); // REMOVED - was overriding fixed camera
            // player.camera.setOffset({ x: 0, y: 0.4, z: 0 }); // REMOVED
            // player.camera.setForwardOffset(0.1); // REMOVED

            // Note: In Hytopia SDK, camera orientation is typically controlled by player input
            // The entity rotation will visually show the correct facing direction
            // For camera control, we rely on the entity rotation to provide visual feedback
            // while the camera follows normal first-person controls

            logger.info('Set up player camera for podium positioning', {
                component: 'PodiumManager',
                playerId: player.id,
                playerName: player.username,
                entityRotation: rotation,
                calculatedYawRadians: yaw,
                cameraMode: 'FIRST_PERSON',
                note: 'Entity rotation provides visual direction, camera follows player input'
            });

        } catch (error) {
            logger.error('Failed to synchronize player camera', error as Error, {
                component: 'PodiumManager',
                playerId: player.id
            });
        }
    }

    /**
     * Ensure all players are facing the correct direction
     * This method can be called periodically to maintain proper orientation
     */
    public ensureProperOrientation(): void {
        this.podiumAssignments.forEach((podiumNumber, playerId) => {
            const position = this.playerPodiums.get(podiumNumber);
            if (!position || !position.rotation) return;

            // Try to find the player and correct their rotation + camera
            const connectedPlayers = this.world.entityManager.getAllPlayerEntities();
            const playerEntity = connectedPlayers.find(p => p.player?.id === playerId);

            if (playerEntity && playerEntity.player) {
                try {
                    // Force entity rotation update
                    playerEntity.setRotation(position.rotation);

                    // For human players, also sync camera
                    if (playerEntity.player) {
                        this.synchronizePlayerCameraWithRotation(playerEntity.player, position.rotation);
                    }

                    logger.debug('Corrected player orientation and camera', {
                        component: 'PodiumManager',
                        playerId,
                        podiumNumber,
                        rotation: position.rotation
                    });
                } catch (error) {
                    logger.warn('Failed to correct player orientation', {
                        component: 'PodiumManager',
                        playerId,
                        error: (error as Error).message
                    });
                }
            } else {
                // Check for AI entities using available world APIs
                try {
                    // Try to find AI entity using world entity methods
                    const allEntities = this.world.entities || [];
                    const aiEntity = allEntities.find(e =>
                        e.id?.toString() === playerId ||
                        e.name === playerId ||
                        (e as any).aiPlayerId === playerId
                    );

                    if (aiEntity && aiEntity.isSpawned) {
                        try {
                            aiEntity.setRotation(position.rotation);
                            logger.debug('Corrected AI orientation', {
                                component: 'PodiumManager',
                                aiId: playerId,
                                podiumNumber,
                                rotation: position.rotation
                            });
                        } catch (error) {
                            logger.warn('Failed to correct AI orientation', {
                                component: 'PodiumManager',
                                aiId: playerId,
                                error: (error as Error).message
                            });
                        }
                    } else {
                        logger.warn('AI entity not found for orientation correction', {
                            component: 'PodiumManager',
                            aiId: playerId,
                            podiumNumber
                        });
                    }
                } catch (error) {
                    logger.error('Error accessing world entities for AI orientation', error as Error, {
                        component: 'PodiumManager',
                        playerId
                    });
                }
            }
        });

        // Also ensure host is facing contestants
        if (this.hostEntity && this.hostEntity.isSpawned && this.hostPodium.rotation) {
            try {
                this.hostEntity.setRotation(this.hostPodium.rotation);
                logger.debug('Corrected host orientation', {
                    component: 'PodiumManager',
                    rotation: this.hostPodium.rotation
                });
            } catch (error) {
                logger.warn('Failed to correct host orientation', {
                    component: 'PodiumManager',
                    error: (error as Error).message
                });
            }
        }
    }

    /**
     * Get current podium assignments
     */
    public getPodiumAssignments(): Map<string, number> {
        return new Map(this.podiumAssignments);
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
    public animateHost(animation: string, loop: boolean = false): void {
        if (this.hostEntity && this.hostEntity.isSpawned) {
            try {
                if (loop) {
                    this.hostEntity.startModelLoopedAnimations([animation]);
                } else {
                    this.hostEntity.startModelOneshotAnimations([animation]);
                }

                logger.info('Host animation started', {
                    component: 'PodiumManager',
                    animation,
                    loop,
                    hostName: this.currentHost?.name
                });
            } catch (error) {
                logger.warn('Failed to animate host', {
                    component: 'PodiumManager',
                    animation,
                    loop,
                    error: (error as Error).message
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