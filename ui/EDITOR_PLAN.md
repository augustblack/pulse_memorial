# Multi-Track Audio Editor Plan

## Project Overview
Create a minimal multi-track audio editor for the Pulse Memorial project with:
- 49 tracks (representing the 49 victims)
- 3-hour timeline duration
- Timeline-based audio positioning and dragging
- Audio clips can overlap on tracks (this is allowed and desired)
- Vertical track arrangement

## Architecture Decisions

### Entry Point Setup
✅ **COMPLETED - Phase 1**
- Add `editor` entry point to `vite.config.ts` rollupOptions
- Create `ui/editor/index.html` following existing pattern
- Create `ui/src/editor.tsx` as main component

### Canvas vs DOM Approach Analysis

**Recommendation: Hybrid Approach**
- Use DOM for track structure and controls
- Use Canvas for waveform visualization within each track (Phase 4+)
- Use Web Audio API for audio processing and playback

### Technical Architecture

#### Data Models
```typescript
type AudioClip = {
  id: string
  audioBuffer: AudioBuffer    // Web Audio API buffer
  startTime: number          // seconds in timeline
  duration: number           // clip duration
  trackIndex: number         // 0-48
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

### ✅ Phase 1: Basic Structure - COMPLETED
1. ✅ Create editor entry point and HTML
2. ✅ Set up basic component structure with 49 empty tracks
3. ✅ Implement timeline ruler (0-3 hours) with staggered time markers
4. ✅ Add horizontal and vertical zoom controls
5. ✅ Add horizontal scrolling with position preservation during zoom
6. ✅ Clean layout with proper spacing and margins

### Phase 2: Test Audio Generation & Basic Playback
1. Create Web Audio API context and utilities
2. Generate 5 test audio buffers with different characteristics:
   - White noise (random length 5-20 seconds)
   - 220Hz sine wave (random length 5-20 seconds)  
   - 220Hz triangle wave (random length 5-20 seconds)
   - 440Hz sine wave (random length 5-20 seconds)
   - 440Hz triangle wave (random length 5-20 seconds)
3. Auto-place test clips on tracks 1-5 at random start times (0-10 seconds)
4. Display audio clips as colored rectangles on tracks
5. Add play/pause button to top controls
6. Implement playhead (vertical line) that moves in sync with playback time
7. Basic playback system that plays all clips at their scheduled times
8. Audio mixing for overlapping clips during playback

### Phase 3: Audio Clip Positioning & Dragging
1. Implement horizontal dragging of audio clips within tracks
2. Allow clips to overlap on tracks (this is intentional)
3. Implement vertical dragging between tracks
4. Visual feedback during drag operations
5. Snap-to-grid functionality for precise positioning
6. Update clip startTime and trackIndex during drag operations
7. Update playback system to reflect dragged clip positions

### Phase 4: Waveform Visualization
1. Generate waveform data from AudioBuffers using Web Audio API
2. Replace colored rectangles with canvas-based waveform visualization
3. Optimize waveform rendering for performance

### Phase 5: Audio Upload Integration (Final Phase)
1. Integrate existing upload functionality from `upload.tsx`
2. Convert uploaded files to AudioBuffers
3. Upload processed audio to R2 using existing `uploadItem` function
4. Load and manage user audio files

### Phase 6: Advanced Playback & Export
1. Enhanced playback controls (seek, stop, loop)
2. Individual track mute/solo controls
3. Volume controls per track
4. Export functionality to render final audio

## Technical Considerations

### Phase 2 Specific - Test Audio Generation
```javascript
// Example test audio generation
const generateSineWave = (frequency: number, duration: number, sampleRate: number = 44100) => {
  const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate)
  const data = buffer.getChannelData(0)
  
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate)
  }
  
  return buffer
}
```

### Phase 3 Specific - Clip Overlap Handling
- Audio clips are allowed to overlap on tracks
- Visual z-index ordering for overlapping clips
- Drag operations should handle overlapping scenarios
- Audio mixing during playback will blend overlapping clips

### Performance Optimizations
- Virtual scrolling for timeline (only render visible portion)
- Lazy load waveform data
- Use `requestAnimationFrame` for smooth animations
- Debounce drag operations

### State Management
- Use SolidJS stores for reactive state
- Consider persistence to localStorage for draft sessions
- Undo/redo stack for user actions

### Audio Processing
- Web Audio API for all audio operations
- Support for overlapping audio clip playback
- Real-time audio mixing capabilities

## UI/UX Design

### Timeline Layout
✅ **COMPLETED**
- Variable height per track with vertical zoom
- Horizontal scrollbar for 3-hour timeline with position preservation
- Dual zoom controls (horizontal: 1-20 px/s, vertical: 5 height options)
- Staggered time markers (odd/even track pattern)

### Audio Clip Design
- Colored rectangles initially (Phase 3)
- Waveform visualization later (Phase 4)
- Drag handles and visual feedback
- Support for overlapping display

### Responsive Considerations
- Touch-friendly drag operations
- Minimum viewport width for usability

## Integration Points

### Audio Context Setup
- Create dedicated EditorContext for audio operations
- Web Audio API context management
- AudioBuffer utilities and management

### Future Integration (Phase 5)
- Reuse existing R2 upload system from `upload.tsx`
- Leverage existing Tailwind/DaisyUI theming
- Use existing hash-based naming convention

This revised plan focuses on building core functionality with test audio first, then adding upload capabilities as the final step. The overlap-friendly design supports complex audio layering scenarios.