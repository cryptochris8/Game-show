# Camera Setup Guide - Fixed View from Screenshot

This guide explains how to set up a specific camera view in Hytopia that matches a screenshot taken while in the map.

## Best Approach: Create an Invisible Entity at Fixed Position

The most effective way to set up a camera view matching your screenshot is:

1. **Create an invisible entity** at the exact position and rotation where you want the camera
2. **Attach the player's camera** to this invisible entity
3. **Optionally track the game action** while maintaining the fixed perspective

## Implementation Techniques

### Option 1: Fixed Cinematic Camera (Recommended)
```typescript
// Create invisible camera entity at your desired position/rotation
const cameraEntity = new Entity({
  modelUri: '', // No model = invisible
  rigidBodyOptions: { type: RigidBodyType.FIXED }
});

// Spawn at exact position/rotation from your screenshot
cameraEntity.spawn(world,
  { x: yourX, y: yourY, z: yourZ },
  { x: rotX, y: rotY, z: rotZ, w: rotW }
);

// Attach player camera to this fixed entity
player.camera.setAttachedToEntity(cameraEntity);

// Optionally track game board area
player.camera.setTrackedPosition({ x: boardX, y: boardY, z: boardZ });
```

### Option 2: Fixed Position with Direct Attachment
```typescript
// Attach camera directly to a specific position
player.camera.setAttachedToPosition({ x: yourX, y: yourY, z: yourZ });

// Make camera look at the game board
player.camera.setTrackedPosition({ x: boardX, y: boardY, z: boardZ });
```

### Option 3: Camera with Specific Offsets
```typescript
// If you want to offset from an existing entity (like game board center)
player.camera.setAttachedToEntity(gameBoardEntity);
player.camera.setOffset({ x: offsetX, y: offsetY, z: offsetZ });
player.camera.setFilmOffset(sidewaysShift); // Left/right adjustment
```

## Fine-Tuning Options

- **`setFov(degrees)`** - Adjust field of view to match screenshot perspective
- **`setZoom(value)`** - Zoom in/out to match screenshot scale
- **`setFilmOffset(value)`** - Shift camera left/right
- **`setOffset({x,y,z})`** - Adjust position relative to attachment point

## Getting Exact Position/Rotation from Screenshot

1. **Take note of coordinates** when you took the screenshot
2. **Check player position** and camera orientation at that moment
3. **Use those coordinates** for the invisible entity position
4. **Test and adjust** offsets until it matches perfectly

## Complete Example

```typescript
// When game starts or player joins
world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
  // Create invisible camera mount
  const cameraMount = new Entity({
    rigidBodyOptions: { type: RigidBodyType.FIXED }
  });

  // Position from your screenshot
  cameraMount.spawn(world, { x: 10, y: 8, z: -5 }, { x: 0, y: 0.707, z: 0, w: 0.707 });

  // Set camera to this fixed view
  player.camera.setAttachedToEntity(cameraMount);
  player.camera.setTrackedPosition({ x: 0, y: 3, z: 0 }); // Look at game board
  player.camera.setFov(75); // Adjust to match screenshot
});
```

## Available Camera Control Methods

| Method                      | Description                                         |
|-----------------------------|-----------------------------------------------------|
| `setMode(mode)`             | Set camera mode (first or third person)             |
| `setOffset({x,y,z})`        | Offset camera relative to attached entity           |
| `setForwardOffset(value)`   | Move camera forward/backward (first person only)    |
| `setFilmOffset(value)`      | Shift camera left/right relative to attachment      |
| `setAttachedToEntity(entity)` | Attach camera to an entity                          |
| `setAttachedToPosition(pos)` | Attach camera to a fixed position                   |
| `setTrackedEntity(entity)`  | Make camera track an entity                           |
| `setTrackedPosition(pos)`   | Make camera track a position                         |
| `setFov(value)`             | Set field of view                                    |
| `setZoom(value)`            | Set zoom level                                      |
| `setHiddenModelNodes(nodes)`| Hide specified model nodes from camera view          |

## Tips

- Use invisible entities (no modelUri) for clean camera mounting points
- Fixed RigidBodyType prevents the camera mount from moving
- Combine `setAttachedToEntity` with `setTrackedPosition` for cinematic effects
- Test different FOV and zoom values to match your screenshot perspective
- Use `setFilmOffset` for over-the-shoulder or side-angle views

This approach gives you complete control over the camera position and ensures all players see the exact same perspective that matches your screenshot.

## Implementation Status - Buzzchain Trivia

✅ **IMPLEMENTED**: Fixed camera system has been added to the Buzzchain trivia game with the following setup:

### Current Configuration
```typescript
// Camera mount position (invisible entity)
Position: { x: 14, y: 8, z: 2 }
Rotation: { x: -0.15, y: 0, z: 0, w: 0.989 } // Slight downward angle

// Camera tracking (where it looks)
Tracked Position: { x: 9, y: 3, z: -5 } // Game board area
FOV: 85 degrees
Zoom: 1.2x
```

### What Players See
- Elevated view showing the entire game area
- Perfect framing of podiums and game board
- Consistent perspective for all players
- Professional "game show" camera angle

### Activation
- Camera activates **immediately** when players join the world
- Active during main menu and throughout the game
- No player movement controls affect the camera view

### Fine-Tuning Options
If you want to adjust the view, modify these values in `index.ts`:
- **Height**: Change `y: 8` in camera mount position
- **Angle**: Adjust the rotation quaternion values
- **Focus**: Modify the tracked position coordinates
- **Zoom**: Change the zoom value (1.0 = normal, 1.2 = slightly zoomed)
- **FOV**: Adjust field of view (75 = narrow, 90 = wide)