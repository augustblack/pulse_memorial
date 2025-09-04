# Multi-Track Audio Editor Plan

## Project Overview
Create a minimal multi-track audio editor for the Pulse Memorial project with:
- 49 tracks (representing the 49 victims)
- 3-hour timeline duration
- Drag-and-drop audio file upload
- Timeline-based audio positioning
- Vertical track arrangement

## Architecture Decisions

### Entry Point Setup
- Add `editor` entry point to `vite.config.ts` rollupOptions
- Create `ui/editor/index.html` following existing pattern
- Create `ui/src/editor.tsx` as main component

### Canvas vs DOM Approach Analysis

**Canvas Approach Pros:**
- Better performance with 49 tracks
- Smooth waveform rendering
- Precise pixel-level positioning
- Custom drawing for timeline markers
- Better for complex audio visualizations

**Canvas Approach Cons:**
- More complex drag-and-drop implementation
- Accessibility challenges
- Custom UI controls needed
- More complex hit detection

**DOM Approach Pros:**
- Leverages existing Tailwind/DaisyUI styling
- Native drag-and-drop API support
- Better accessibility
- Easier to integrate with existing upload system
- Simpler event handling

**DOM Approach Cons:**
- Potential performance issues with 49 tracks
- Less precise positioning
- CSS limitations for complex layouts

**Recommendation: Hybrid Approach**
- Use DOM for track structure and controls
- Use Canvas for waveform visualization within each track
- Use Web Audio API for audio processing and playback

### Technical Architecture

#### Component Structure
```
EditorApp (main container)
├── Timeline (horizontal time ruler)
├── TrackList (49 tracks)
│   └── Track (individual track)
│       ├── TrackHeader (track number, controls)
│       ├── TrackCanvas (waveform visualization)
│       └── AudioClips (positioned audio segments)
└── PlaybackControls (play/pause/seek)
```

#### Data Models
```typescript
type AudioClip = {
  id: string
  audioUrl: string
  startTime: number    // seconds in timeline
  duration: number     // clip duration
  trackIndex: number   // 0-48
  waveformData?: Float32Array
}

type EditorState = {
  clips: AudioClip[]
  playheadPosition: number     // current playback position
  horizontalZoom: number       // pixels per second
  verticalZoom: string         // tailwind height class
  isPlaying: boolean
}
```

## Implementation Strategy

### Phase 1: Basic Structure
1. Create editor entry point and HTML
2. Set up basic component structure with 49 empty tracks
3. Implement timeline ruler (0-3 hours)
4. Add horizontal and vertical zoom controls
5. Add horizontal scrolling for timeline

### Phase 2: Audio Upload Integration
1. Integrate existing upload functionality from `upload.tsx`
2. Create drag-and-drop zone for each track
3. Upload audio files to R2 using existing `uploadItem` function
4. Display audio clips as simple colored rectangles (no waveforms yet)

### Phase 3: Timeline Positioning
1. Implement horizontal dragging of audio clips within tracks
2. Snap-to-grid functionality for precise positioning
3. Visual feedback during drag operations
4. Prevent clips from overlapping

### Phase 4: Vertical Track Movement
1. Implement vertical dragging between tracks
2. Visual indicators for valid drop zones
3. Update trackIndex when clips move between tracks

### Phase 5: Waveforms & Polish
1. Generate waveform data using Web Audio API
2. Replace colored rectangles with canvas-based waveform visualization
3. Web Audio API based playback system
4. Mix all tracks in real-time during playback
5. Export functionality to render final audio

## Technical Considerations

### Performance Optimizations
- Virtual scrolling for timeline (only render visible portion)
- Lazy load waveform data
- Use `requestAnimationFrame` for smooth animations
- Debounce drag operations

### File Management
- Reuse existing R2 upload system from `upload.tsx`
- Store clip metadata separately from audio files
- Use existing hash-based naming convention

### State Management
- Use SolidJS stores for reactive state
- Consider persistence to localStorage for draft sessions
- Undo/redo stack for user actions

### Audio Processing
- Web Audio API for waveform analysis
- Pre-process audio files for waveform visualization
- Support common audio formats (mp3, wav, ogg, aac)

### Vertical Zoom Implementation
- Use Tailwind height classes for track sizing
- Zoom levels: `h-16` (default), `h-12`, `h-8`, `h-4`, `h-2` (most zoomed out)
- For extreme zoom out, use arbitrary values: `h-[8px]`, `h-[4px]`
- Store current zoom level in state as Tailwind class string
- Apply same height class to all 49 tracks simultaneously

## UI/UX Design

### Timeline Layout
- Variable height per track with vertical zoom
- Horizontal scrollbar for 3-hour timeline
- Dual zoom controls:
  - Horizontal zoom (pixels per second)
  - Vertical zoom (track height using Tailwind classes)
- Time ruler with second/minute markers

### Track Design
- Track number indicator (1-49)
- Mute/solo buttons per track
- Volume fader per track
- Visual waveform in canvas
- Drag handles on audio clips

### Responsive Considerations
- Minimum viewport width for usability
- Collapsible track controls on smaller screens
- Touch-friendly drag operations

## Integration Points

### Existing Codebase
- Reuse `uploadItem` function from `upload.tsx`
- Reuse `calcDigest` for file hashing
- Leverage existing R2 configuration
- Use existing Tailwind/DaisyUI theming

### Audio Context
- Extend existing `UploadContext` or create separate `EditorContext`
- Share Web Audio API setup patterns
- Reuse audio processing utilities

This plan provides a solid foundation for building a minimal but functional multi-track audio editor that integrates well with the existing Pulse Memorial codebase while maintaining the project's functional programming and camelCase conventions.