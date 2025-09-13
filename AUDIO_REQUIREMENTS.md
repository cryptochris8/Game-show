# 🎵 Buzzchain Trivia - Audio Files Required

## 📂 Directory Structure
All audio files should be placed in the `assets/audio/` directory with the following structure:

```
assets/
└── audio/
    ├── music/
    │   ├── main-menu.mp3
    │   ├── game-background.mp3
    │   └── final-round.mp3
    └── sfx/
        ├── hover.mp3
        ├── click.mp3
        ├── confirm.mp3
        ├── transition.mp3
        ├── buzz.mp3
        ├── correct.mp3
        └── incorrect.mp3
```

## 🎼 Music Files (Background/Ambient)

### `assets/audio/music/main-menu.mp3`
- **Description**: Main menu background music
- **Style**: Upbeat, professional, game show-like
- **Duration**: 2-4 minutes (must loop seamlessly)
- **Volume**: Should be pleasant at 30% volume
- **Mood**: Welcoming, exciting, anticipation-building
- **Reference**: Think "Jeopardy theme" but modern

### `assets/audio/music/game-background.mp3`
- **Description**: In-game background music during rounds
- **Style**: Subtle, non-distracting, maintains tension
- **Duration**: 3-5 minutes (must loop seamlessly)
- **Volume**: Should be background at 20% volume
- **Mood**: Focused, contemplative, slightly tense
- **Reference**: Game show background music during play

### `assets/audio/music/final-round.mp3`
- **Description**: Final round dramatic music
- **Style**: Dramatic, intense, climactic
- **Duration**: 2-3 minutes (for final round duration)
- **Volume**: Should be impactful at 40% volume
- **Mood**: Dramatic, suspenseful, high-stakes
- **Reference**: "Final Jeopardy" music but more intense

## 🔊 Sound Effects (SFX)

### `assets/audio/sfx/hover.mp3`
- **Description**: Button hover sound
- **Duration**: 0.1-0.2 seconds
- **Volume**: Subtle at 20% volume
- **Style**: Soft, pleasant "whoosh" or gentle chime
- **Trigger**: When mouse hovers over buttons/cards

### `assets/audio/sfx/click.mp3`
- **Description**: Button click sound
- **Duration**: 0.1-0.3 seconds
- **Volume**: Clear at 40% volume
- **Style**: Satisfying "click" or "tap" sound
- **Trigger**: When buttons are clicked

### `assets/audio/sfx/confirm.mp3`
- **Description**: Confirmation action sound
- **Duration**: 0.3-0.5 seconds
- **Volume**: Positive at 50% volume
- **Style**: Success chime, upward musical phrase
- **Trigger**: When starting games, confirming selections

### `assets/audio/sfx/transition.mp3`
- **Description**: Screen transition sound
- **Duration**: 0.5-1.0 seconds
- **Volume**: Smooth at 60% volume
- **Style**: Smooth "swoosh" or musical transition
- **Trigger**: Moving from main menu to game

### `assets/audio/sfx/buzz.mp3`
- **Description**: Buzzer sound for answering
- **Duration**: 0.5-1.0 seconds
- **Volume**: Attention-grabbing at 70% volume
- **Style**: Classic game show buzzer
- **Trigger**: When players buzz in to answer

### `assets/audio/sfx/correct.mp3`
- **Description**: Correct answer sound
- **Duration**: 1.0-2.0 seconds
- **Volume**: Rewarding at 60% volume
- **Style**: Positive chime, success fanfare
- **Trigger**: When player answers correctly

### `assets/audio/sfx/incorrect.mp3`
- **Description**: Incorrect answer sound
- **Duration**: 0.5-1.0 seconds
- **Volume**: Clear but not harsh at 50% volume
- **Style**: Gentle "wrong" sound, not punishing
- **Trigger**: When player answers incorrectly

## 🎚️ Technical Specifications

### Audio Format
- **Primary**: MP3 (widely supported)
- **Alternative**: OGG Vorbis (if smaller file size needed)
- **Quality**: 44.1kHz, Stereo, 128-192 kbps

### Volume Levels
All volume levels mentioned above are the default server settings. Players can adjust their overall audio levels using the in-game controls.

### Loop Requirements
- **Music files**: Must loop seamlessly with no gap or audio pop
- **SFX files**: Should NOT loop (one-shot sounds)

### File Size Guidelines
- **Music**: Keep under 5MB per file for faster loading
- **SFX**: Keep under 500KB per file for responsiveness

## 🎭 Style Guidelines

### Overall Audio Theme
- **Professional**: Game show quality audio
- **Modern**: Contemporary production values
- **Accessible**: Pleasant for all ages
- **Branded**: Should feel cohesive as "Buzzchain" audio

### Avoid
- Copyrighted music or recognizable melodies
- Harsh or jarring sounds
- Overly long sound effects that interrupt gameplay
- Audio that doesn't compress well to MP3

## 🔧 Implementation Notes

These audio files are loaded by the HYTOPIA Audio system on the server and played synchronously for all players. The server handles:
- Loading audio files at startup
- Playing background music in loops
- Triggering sound effects based on game events
- Volume control and player preferences

Once you create these audio files, simply place them in the specified directories and the game will automatically use them!