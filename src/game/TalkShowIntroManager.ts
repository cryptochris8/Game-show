// TalkShowIntroManager - Orchestrates cinematic talk show style player introductions
// Features camera movements, animations, and humorous player introductions

import { Player, World, Entity, PlayerCameraMode, PlayerManager, RigidBodyType } from 'hytopia';
import { logger } from '../util/Logger';
import { PodiumManager, PodiumPosition } from './PodiumManager';

export interface IntroSequenceOptions {
    skipIntro?: boolean;
    introDurationMs?: number;
    perPlayerIntroMs?: number;
}

interface PlayerIntroData {
    player: Player;
    entity: Entity;
    podiumNumber: number;
    funnyTitle: string;
    funFact: string;
    animation: string;
}

export class TalkShowIntroManager {
    private world: World;
    private podiumManager: PodiumManager;
    private isIntroActive: boolean = false;
    private introSequenceTimer: NodeJS.Timeout | null = null;
    private cameraTimers: NodeJS.Timeout[] = [];
    private currentPlayers: Map<string, Player> | null = null;
    private cameraMounts: Map<string, Entity> = new Map(); // Camera mount entities

    // Funny title templates for players
    private readonly FUNNY_TITLES = [
        'The Button Masher',
        'The Quiz Whiz',
        'The Trivia Titan',
        'The Knowledge Ninja',
        'The Brain Boss',
        'The Fact Fighter',
        'The Question Crusher',
        'The Answer Ace',
        'The Riddle Wrangler',
        'The Puzzle Pro'
    ];

    // Fun fact templates (will be customized based on username)
    private readonly FUN_FACTS = [
        'once memorized the entire Wikipedia page for {topic}',
        'claims to have invented {thing}',
        'thinks {belief} is totally real',
        'has been banned from {place} for knowing too much',
        'once won a debate against {opponent}',
        'collects vintage {items}',
        'dreams in {format}',
        'can recite {content} backwards',
        'believes {theory} explains everything',
        'has a PhD in {subject}'
    ];

    // Define podium positions to match PodiumManager
    private get playerPodiums(): Map<number, PodiumPosition> {
        const podiums = new Map<number, PodiumPosition>();
        podiums.set(1, { x: 4, y: 4, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } });
        podiums.set(2, { x: 9, y: 4, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } });
        podiums.set(3, { x: 14, y: 4, z: -10, rotation: { x: 0, y: 0, z: 0, w: 1 } });
        return podiums;
    }

    private get HOST_PODIUM(): PodiumPosition {
        return { x: 9, y: 4, z: -1, rotation: { x: 0, y: 1, z: 0, w: 0 } };
    }

    // Topics for fun fact generation
    private readonly TOPICS = {
        topic: ['bread', 'penguins', 'doorknobs', 'elevator music', 'rubber ducks', 'staplers'],
        thing: ['the question mark', 'silence', 'the pause button', 'small talk', 'the weekend'],
        belief: ['birds are government drones', 'the moon is cheese', 'cats can read minds', 'WiFi steals dreams'],
        place: ['three libraries', 'the trivia championships', 'multiple quiz shows', 'Wikipedia'],
        opponent: ['a dictionary', 'Siri', 'a magic 8-ball', 'their own reflection', 'a fortune cookie'],
        items: ['calculator watches', 'encyclopedias', 'flash cards', 'expired coupons', 'instruction manuals'],
        format: ['multiple choice', 'spreadsheets', 'PowerPoint', 'binary code', 'haikus'],
        content: ['the alphabet', 'pi to 100 digits', 'every trivia question', 'the phone book'],
        theory: ['butterfly effect', 'six degrees of separation', 'Murphy\'s Law', 'Occam\'s Razor'],
        subject: ['Overthinking', 'Procrastination', 'Memeology', 'Googleology', 'Snackology']
    };

    constructor(world: World, podiumManager: PodiumManager) {
        this.world = world;
        this.podiumManager = podiumManager;
    }

    /**
     * Start the talk show introduction sequence
     */
    public async startIntroSequence(
        players: Map<string, Player>,
        aiPlayers: any[],
        options: IntroSequenceOptions = {}
    ): Promise<void> {
        if (this.isIntroActive) {
            logger.warn('Introduction sequence already active', {
                component: 'TalkShowIntroManager'
            });
            return;
        }

        if (options.skipIntro) {
            logger.info('Skipping introduction sequence', {
                component: 'TalkShowIntroManager'
            });
            return;
        }

        this.isIntroActive = true;
        this.currentPlayers = players;

        // Ensure all players are facing the correct direction before intro
        this.podiumManager.ensureProperOrientation();

        try {
            logger.info('Starting talk show introduction sequence', {
                component: 'TalkShowIntroManager',
                playerCount: players.size,
                aiCount: aiPlayers.length
            });

            // Prepare player intro data
            logger.info('Preparing player intro data...', {
                component: 'TalkShowIntroManager'
            });
            const introData = this.preparePlayerIntroData(players, aiPlayers);

            logger.info('Prepared intro data', {
                component: 'TalkShowIntroManager',
                introDataCount: introData.length,
                playerNames: introData.map(d => d.player.username)
            });

            // Get host greeting
            logger.info('Getting host greeting...', {
                component: 'TalkShowIntroManager'
            });
            const hostGreeting = this.podiumManager.getHostGreeting();
            const hostName = this.podiumManager.getCurrentHost()?.name || 'The Host';

            logger.info('Host info retrieved', {
                component: 'TalkShowIntroManager',
                hostName,
                hostGreeting
            });

            // Send opening message
            logger.info('Broadcasting opening message...', {
                component: 'TalkShowIntroManager'
            });
            this.broadcastMessage(`🎬 LIVE FROM THE BUZZCHAIN STUDIO!`, 'FFD700');
            await this.delay(2000);

            // Introduce each contestant
            logger.info('Starting contestant introductions...', {
                component: 'TalkShowIntroManager',
                contestantCount: introData.length
            });
            for (const data of introData) {
                logger.info('Introducing contestant', {
                    component: 'TalkShowIntroManager',
                    player: data.player.username,
                    podium: data.podiumNumber
                });
                await this.introduceContestant(data);
            }

            // Host introduction
            logger.info('Starting host introduction...', {
                component: 'TalkShowIntroManager'
            });
            await this.introduceHost(hostName, hostGreeting);

            // Final transition
            logger.info('Final transition...', {
                component: 'TalkShowIntroManager'
            });
            await this.delay(2000);
            this.broadcastMessage(`🎮 LET THE GAME BEGIN!`, 'FFD700');
            await this.delay(1500);

            // Reset cameras to normal gameplay
            logger.info('Resetting cameras...', {
                component: 'TalkShowIntroManager'
            });
            this.resetAllCameras(players);

            logger.info('Introduction sequence completed', {
                component: 'TalkShowIntroManager'
            });

        } catch (error) {
            logger.error('Failed to complete introduction sequence', error as Error, {
                component: 'TalkShowIntroManager'
            });
        } finally {
            this.isIntroActive = false;
            this.currentPlayers = null;
            this.cleanup();
        }
    }

    /**
     * Prepare introduction data for all contestants
     */
    private preparePlayerIntroData(
        players: Map<string, Player>,
        aiPlayers: any[]
    ): PlayerIntroData[] {
        const introData: PlayerIntroData[] = [];
        let podiumIndex = 1;

        try {
            logger.info('Processing human players...', {
                component: 'TalkShowIntroManager',
                playerCount: players.size
            });

            // Add human players
            players.forEach((player) => {
                logger.debug('Processing human player', {
                    component: 'TalkShowIntroManager',
                    playerId: player.id,
                    username: player.username,
                    hasEntity: !!player.entity,
                    podiumIndex
                });

                if (player.entity && podiumIndex <= 3) {
                    introData.push({
                        player,
                        entity: player.entity,
                        podiumNumber: podiumIndex++,
                        funnyTitle: this.generateFunnyTitle(player.username),
                        funFact: this.generateFunFact(player.username),
                        animation: this.selectIntroAnimation()
                    });

                    logger.debug('Added human player to intro data', {
                        component: 'TalkShowIntroManager',
                        username: player.username,
                        podiumNumber: podiumIndex - 1
                    });
                }
            });

            logger.info('Processing AI players...', {
                component: 'TalkShowIntroManager',
                aiPlayerCount: aiPlayers.length
            });

            // Add AI players
            aiPlayers.forEach((aiPlayer) => {
                logger.debug('Processing AI player', {
                    component: 'TalkShowIntroManager',
                    aiPlayerId: aiPlayer.id,
                    aiPlayerName: aiPlayer.username, // Changed from .name to .username
                    hasEntity: !!aiPlayer.entity,
                    podiumIndex
                });

                if (aiPlayer.entity && podiumIndex <= 3) {
                    // Create a mock player object for AI
                    const mockPlayer = {
                        username: aiPlayer.username, // Changed from .name to .username
                        camera: null // AI doesn't have camera
                    } as any;

                    introData.push({
                        player: mockPlayer,
                        entity: aiPlayer.entity,
                        podiumNumber: podiumIndex++,
                        funnyTitle: this.generateFunnyTitle(aiPlayer.username), // Changed from .name to .username
                        funFact: this.generateFunFact(aiPlayer.username), // Changed from .name to .username
                        animation: this.selectIntroAnimation()
                    });

                    logger.debug('Added AI player to intro data', {
                        component: 'TalkShowIntroManager',
                        aiPlayerName: aiPlayer.username, // Changed from .name to .username
                        podiumNumber: podiumIndex - 1
                    });
                }
            });

        } catch (error) {
            logger.error('Error preparing player intro data', error as Error, {
                component: 'TalkShowIntroManager'
            });
            throw error;
        }

        return introData;
    }

    /**
     * Introduce a single contestant with camera focus
     */
    private async introduceContestant(data: PlayerIntroData): Promise<void> {
        const { player, entity, podiumNumber, funnyTitle, funFact } = data;

        // Use specific camera positions for each podium
        this.setCamerasToContestantView(podiumNumber, this.currentPlayers);

        // Announce the player
        await this.delay(500);
        this.broadcastMessage(
            `🎯 In Podium ${podiumNumber}: ${player.username}!`,
            '00FF00'
        );

        await this.delay(1500);
        this.broadcastMessage(
            `📋 "${funnyTitle}"`,
            'FFD700'
        );

        // Trigger player animation
        if (entity && entity.isSpawned) {
            try {
                entity.startModelOneshotAnimations([data.animation]);
            } catch (error) {
                logger.warn('Failed to play intro animation', {
                    component: 'TalkShowIntroManager',
                    animation: data.animation,
                    player: player.username
                });
            }
        }

        await this.delay(2000);
        this.broadcastMessage(
            `💡 Fun Fact: ${funFact}`,
            '87CEEB'
        );

        await this.delay(3000);
    }

    /**
     * Introduce the host with camera focus
     */
    private async introduceHost(hostName: string, hostGreeting: string): Promise<void> {
        const hostEntity = this.podiumManager['hostEntity'];

        if (hostEntity && hostEntity.isSpawned) {
            // Use specific camera position for host
            this.setCamerasToHostView(this.currentPlayers);

            await this.delay(1000);
            this.broadcastMessage(
                `🎤 And your host... ${hostName}!`,
                'FF69B4'
            );

            // Host animation
            try {
                this.podiumManager.animateHost('wave');
            } catch (error) {
                logger.warn('Failed to animate host', {
                    component: 'TalkShowIntroManager'
                });
            }

            await this.delay(2000);
            this.broadcastMessage(hostGreeting, 'FFFFFF');

            await this.delay(2500);
            this.broadcastMessage(
                `I am the keeper of the Golden Knowledge Chain! Each link represents wisdom earned through trivia mastery!`,
                'FFD700'
            );

            await this.delay(3000);
            this.broadcastMessage(
                `Answer correctly to forge new links! Build the longest chain and become a Buzzchain legend!`,
                'FFD700'
            );
        }
    }

    /**
     * Set cameras to specific positions for contestant introductions using invisible camera mount entities
     */
    private setCamerasToContestantView(podiumNumber: number, players?: Map<string, Player>): void {
        // Camera positions properly offset from each podium for direct character shots
        // Podiums are at y:4, z:-10, so camera needs to be in front (higher z value) at eye level
        const cameraPositions = {
            1: { x: 4, y: 5.5, z: -7 },   // Podium 1 (x:4) - camera 3 units in front, slightly above
            2: { x: 9, y: 5.5, z: -7 },   // Podium 2 (x:9) - camera 3 units in front, slightly above
            3: { x: 14, y: 5.5, z: -7 }   // Podium 3 (x:14) - camera 3 units in front, slightly above
        };

        const cameraPosition = cameraPositions[podiumNumber as keyof typeof cameraPositions];
        if (!cameraPosition) {
            logger.warn('Invalid podium number for camera positioning', {
                component: 'TalkShowIntroManager',
                podiumNumber
            });
            return;
        }

        // Create or get camera mount entity for this position
        const mountKey = `contestant_${podiumNumber}`;
        let cameraMount = this.cameraMounts.get(mountKey);

        if (!cameraMount || !cameraMount.isSpawned) {
            cameraMount = new Entity({
                modelUri: 'models/misc/selection-indicator.gltf',
                modelScale: 0.01, // Make it very small
                name: `CameraMount_Contestant_${podiumNumber}`,
                rigidBodyOptions: { type: RigidBodyType.FIXED }
            });

            cameraMount.spawn(this.world, cameraPosition);

            // Add slight downward tilt to properly frame characters
            // Quaternion for ~10 degree downward tilt around X axis
            cameraMount.setRotation({ x: -0.087, y: 0, z: 0, w: 0.996 });

            cameraMount.setOpacity(0); // Make it invisible
            this.cameraMounts.set(mountKey, cameraMount);

            logger.debug('Created camera mount for contestant view', {
                component: 'TalkShowIntroManager',
                podiumNumber,
                cameraPosition,
                rotation: 'slight downward tilt'
            });
        }

        // Get all connected players
        const connectedPlayers = players ? Array.from(players.values()) :
            PlayerManager.instance.getConnectedPlayersByWorld(this.world);

        connectedPlayers.forEach((player) => {
            if (player && player.camera) {
                try {
                    logger.debug('Setting camera to contestant view', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id,
                        podiumNumber,
                        cameraPosition
                    });

                    // Set to third person for cinematic view
                    player.camera.setMode(PlayerCameraMode.THIRD_PERSON);

                    // Attach camera to the invisible mount entity (preserves HYTOPIA UI)
                    player.camera.setAttachedToEntity(cameraMount);

                    // Set zoom for proper character framing
                    const zoomSettings = {
                        1: 1.8,  // Medium shot to show full character
                        2: 1.8,  // Medium shot to show full character
                        3: 1.8   // Medium shot to show full character
                    };
                    const zoom = zoomSettings[podiumNumber as keyof typeof zoomSettings] || 1.8;
                    player.camera.setZoom(zoom);

                    // Look at the podium position directly (where the player/AI is standing)
                    const podiumPos = this.playerPodiums.get(podiumNumber);
                    if (podiumPos) {
                        // Track position slightly above podium center for better character framing
                        player.camera.setTrackedPosition({
                            x: podiumPos.x,
                            y: podiumPos.y + 1.5,  // Look at chest/head level
                            z: podiumPos.z
                        });
                    }

                    // Ensure UI remains visible during intro
                    if (player.ui) {
                        player.ui.lockPointer(false);
                    }

                } catch (error) {
                    logger.warn('Failed to set contestant camera view', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id,
                        podiumNumber,
                        error: error.message
                    });
                }
            }
        });
    }

    /**
     * Set cameras to host view position using invisible camera mount entity
     */
    private setCamerasToHostView(players?: Map<string, Player>): void {
        // Host camera position - in front of host for proper framing
        // Host is at x:9, y:4, z:-1, so camera should be further out (higher z value)
        const hostCameraPosition = { x: 9, y: 5.5, z: 2 };

        // Create or get camera mount entity for host position
        const mountKey = 'host';
        let cameraMount = this.cameraMounts.get(mountKey);

        if (!cameraMount || !cameraMount.isSpawned) {
            cameraMount = new Entity({
                modelUri: 'models/misc/selection-indicator.gltf',
                modelScale: 0.01, // Make it very small
                name: 'CameraMount_Host',
                rigidBodyOptions: { type: RigidBodyType.FIXED }
            });

            cameraMount.spawn(this.world, hostCameraPosition);

            // Add slight downward tilt to properly frame Buzzy Bee
            // Quaternion for ~10 degree downward tilt around X axis
            cameraMount.setRotation({ x: -0.087, y: 0, z: 0, w: 0.996 });

            cameraMount.setOpacity(0); // Make it invisible
            this.cameraMounts.set(mountKey, cameraMount);

            logger.debug('Created camera mount for host view', {
                component: 'TalkShowIntroManager',
                cameraPosition: hostCameraPosition,
                rotation: 'slight downward tilt'
            });
        }

        // Get all connected players
        const connectedPlayers = players ? Array.from(players.values()) :
            PlayerManager.instance.getConnectedPlayersByWorld(this.world);

        connectedPlayers.forEach((player) => {
            if (player && player.camera) {
                try {
                    logger.debug('Setting camera to host view', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id,
                        cameraPosition: hostCameraPosition
                    });

                    // Set to third person for cinematic view
                    player.camera.setMode(PlayerCameraMode.THIRD_PERSON);

                    // Attach camera to the invisible mount entity (preserves HYTOPIA UI)
                    player.camera.setAttachedToEntity(cameraMount);

                    // Set zoom for proper host framing
                    player.camera.setZoom(1.8);

                    // Track the host position directly
                    const hostPodium = this.HOST_PODIUM;
                    player.camera.setTrackedPosition({
                        x: hostPodium.x,
                        y: hostPodium.y + 1.5,  // Look at chest/head level
                        z: hostPodium.z
                    });

                    // Ensure UI remains visible during intro
                    if (player.ui) {
                        player.ui.lockPointer(false);
                    }

                } catch (error) {
                    logger.warn('Failed to set host camera view', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id,
                        error: error.message
                    });
                }
            }
        });
    }

    /**
     * Focus all player cameras on a specific entity (legacy method - keeping for compatibility)
     */
    private focusCamerasOnEntity(
        targetEntity: Entity,
        options: {
            zoom?: number;
            offset?: { x: number; y: number; z: number };
            filmOffset?: number;
        } = {},
        players?: Map<string, Player>
    ): void {
        // Get all connected players from PlayerManager
        const connectedPlayers = players ? Array.from(players.values()) :
            PlayerManager.instance.getConnectedPlayersByWorld(this.world);

        connectedPlayers.forEach((player) => {
            if (player && player.camera) {
                try {
                    logger.debug('Focusing camera on entity', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id,
                        entityId: targetEntity.id
                    });

                    // Set to third person for cinematic view
                    player.camera.setMode(PlayerCameraMode.THIRD_PERSON);

                    // Attach camera to target entity
                    player.camera.setAttachedToEntity(targetEntity);

                    // Apply camera settings
                    if (options.zoom !== undefined) {
                        player.camera.setZoom(options.zoom);
                    }

                    if (options.offset) {
                        player.camera.setOffset(options.offset);
                    }

                    if (options.filmOffset !== undefined) {
                        player.camera.setFilmOffset(options.filmOffset);
                    }

                    // Make camera look at the entity
                    player.camera.setTrackedEntity(targetEntity);

                } catch (error) {
                    logger.warn('Failed to focus camera on entity', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id,
                        error: error.message
                    });
                }
            } else {
                logger.warn('Player or camera not available for focus', {
                    component: 'TalkShowIntroManager',
                    hasPlayer: !!player,
                    hasCamera: player?.camera
                });
            }
        });
    }

    /**
     * Reset all cameras to normal gameplay view
     */
    private resetAllCameras(players: Map<string, Player>): void {
        players.forEach((player) => {
            if (player.camera && player.entity) {
                try {
                    // Reset to player's own entity
                    player.camera.setAttachedToEntity(player.entity);

                    // Clear tracking
                    player.camera.setTrackedEntity(undefined);

                    // Reset to default third person settings
                    player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
                    player.camera.setZoom(2);
                    player.camera.setOffset({ x: 0, y: 0, z: 0 });
                    player.camera.setFilmOffset(0);

                } catch (error) {
                    logger.warn('Failed to reset camera', {
                        component: 'TalkShowIntroManager',
                        playerId: player.id
                    });
                }
            }
        });
    }

    /**
     * Generate a funny title based on username
     */
    private generateFunnyTitle(username: string): string {
        // Use username characteristics to select title
        const hash = this.simpleHash(username);
        const index = hash % this.FUNNY_TITLES.length;
        return this.FUNNY_TITLES[index];
    }

    /**
     * Generate a fun fact based on username
     */
    private generateFunFact(username: string): string {
        const hash = this.simpleHash(username);
        const factIndex = hash % this.FUN_FACTS.length;
        let fact = this.FUN_FACTS[factIndex];

        // Replace placeholders with random selections
        Object.entries(this.TOPICS).forEach(([key, values]) => {
            if (fact.includes(`{${key}}`)) {
                const valueIndex = (hash + key.length) % values.length;
                fact = fact.replace(`{${key}}`, values[valueIndex]);
            }
        });

        // Add username reference occasionally
        if (hash % 3 === 0) {
            fact = `${username} ${fact}`;
        } else {
            fact = `They ${fact}`;
        }

        return fact;
    }

    /**
     * Select an intro animation
     */
    private selectIntroAnimation(): string {
        const animations = ['wave', 'interact', 'jump'];
        const index = Math.floor(Math.random() * animations.length);
        return animations[index];
    }

    /**
     * Simple hash function for consistent randomization
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Send a broadcast message to all players
     */
    private broadcastMessage(message: string, color?: string): void {
        try {
            logger.info('Broadcasting intro message', {
                component: 'TalkShowIntroManager',
                message: message,
                color: color,
                playerCount: this.currentPlayers?.size || 0
            });

            this.world.chatManager.sendBroadcastMessage(message, color);

        } catch (error) {
            logger.error('Failed to broadcast message', error as Error, {
                component: 'TalkShowIntroManager',
                message
            });
        }
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => {
            const timer = setTimeout(resolve, ms);
            this.cameraTimers.push(timer);
        });
    }

    /**
     * Get podium entity for camera tracking
     */
    private getPodiumEntity(podiumNumber: number): Entity | undefined {
        try {
            // Try to get the player entity at this podium
            const podiumAssignments = this.podiumManager.getPodiumAssignments();
            for (const [playerId, assignment] of podiumAssignments) {
                if (assignment.podiumNumber === podiumNumber && assignment.entity) {
                    return assignment.entity;
                }
            }
            return undefined;
        } catch (error) {
            logger.warn('Failed to get podium entity', {
                component: 'TalkShowIntroManager',
                podiumNumber,
                error: error.message
            });
            return undefined;
        }
    }

    /**
     * Clean up timers and camera mounts
     */
    private cleanup(): void {
        this.cameraTimers.forEach(timer => clearTimeout(timer));
        this.cameraTimers = [];

        if (this.introSequenceTimer) {
            clearTimeout(this.introSequenceTimer);
            this.introSequenceTimer = null;
        }

        // Clean up camera mount entities
        this.cameraMounts.forEach((mount, key) => {
            try {
                if (mount && mount.isSpawned) {
                    mount.despawn();
                }
            } catch (error) {
                logger.warn('Failed to cleanup camera mount', {
                    component: 'TalkShowIntroManager',
                    mountKey: key
                });
            }
        });
        this.cameraMounts.clear();
    }

    /**
     * Stop the introduction sequence
     */
    public stopIntroSequence(): void {
        if (this.isIntroActive) {
            logger.info('Stopping introduction sequence', {
                component: 'TalkShowIntroManager'
            });

            this.isIntroActive = false;
            this.cleanup();
        }
    }

    /**
     * Check if intro is currently active
     */
    public isIntroInProgress(): boolean {
        return this.isIntroActive;
    }
}

export default TalkShowIntroManager;