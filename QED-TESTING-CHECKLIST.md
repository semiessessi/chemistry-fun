# QED Photon Absorption - Testing Checklist

## Quick Start Test

1. **Open the application** in a web browser
   - Navigate to `index.html`
   - Open browser console (F12) to check for errors

2. **Select Transitions mode**
   - Dropdown: **Mode** → "Transitions"
   - Should see transition-wrapper controls appear

3. **Select a transition**
   - Shell dropdown → any shell (e.g., "1s")
   - Subshell dropdown → select transition (e.g., "Lyman α (1s → 2p)")

4. **Verify QED Info Display**
   - Should see Bohr frequency: `ω = 15.50×10¹⁵ rad/s`
   - Should see period: `T = 0.41 fs`

5. **Wait for frame building to complete**
   - Progress bar should appear: "Building frame X/48..."
   - Should complete in 5-10 seconds

6. **Click ▶ Play button**
   - Transition should animate smoothly
   - Timeline scrubber should move automatically

## Feature Tests

### Test 1: QED Oscillations (Default ON)
- ✅ **Expected:** Electron density should "breathe" (opacity oscillates)
- ✅ **Look for:** Visible oscillations at t≈0.5 (middle of transition)
- ✅ **Check:** Oscillations fade at t=0 and t=1 (start/end)
- ✅ **Count:** Should see ~3 complete oscillation cycles during transition

### Test 2: Oscillation Speed Slider
- Move slider to **0.5×**
  - ✅ Oscillations should slow down (longer period)
- Move slider to **5.0×**
  - ✅ Oscillations should speed up (more cycles visible)
- Reset to **2.0×** (default)

### Test 3: QED Oscillations Toggle
- Uncheck "QED Oscillations"
  - ✅ Oscillations should stop
  - ✅ Should see smooth morphing instead (static superposition)
- Re-check "QED Oscillations"
  - ✅ Oscillations should resume

### Test 4: Show Dipole Moment (Default ON)
- ✅ **Expected:** Magenta arrow at origin (nucleus)
- ✅ **Behavior:** Arrow should oscillate in/out
- ✅ **Color:** Should alternate red ↔ blue
- ✅ **Magnitude:** Should be largest at t≈0.5, zero at t=0 and t=1
- Uncheck "Show Dipole Moment"
  - ✅ Arrow should disappear
- Re-check to restore

### Test 5: Show EM Field (Default OFF)
- Check "Show EM Field"
  - ✅ Should see vector field appear (arrows or streamlines)
  - ✅ Field should oscillate in sync with electron density
  - ✅ Field amplitude should decay as t: 0→1 (absorption)
  - ✅ Field should be brightest at t=0, dimmest at t=1
- Uncheck to hide field

### Test 6: Timeline Scrubber
- Pause the transition
- Drag scrubber to t=0%
  - ✅ Should show pure ground state (1s)
  - ✅ Oscillations should be at minimum
- Drag scrubber to t=50%
  - ✅ Should show equal superposition
  - ✅ Oscillations should be at maximum amplitude
- Drag scrubber to t=100%
  - ✅ Should show pure excited state (2p)
  - ✅ Oscillations should be at minimum

## Different Transitions

Test with various transitions to verify physics:

### Lyman Series (UV)
- **1s → 2p:** ω = 15.50×10¹⁵ rad/s, T = 0.41 fs
- **1s → 3p:** ω = 17.37×10¹⁵ rad/s, T = 0.36 fs
- **1s → 4p:** ω = 17.99×10¹⁵ rad/s, T = 0.35 fs

### Balmer Series (Visible)
- **2s → 3p:** ω = 2.87×10¹⁵ rad/s, T = 2.19 fs
- **2p → 3s:** ω = 2.87×10¹⁵ rad/s, T = 2.19 fs
- **2p → 3d:** ω = 2.87×10¹⁵ rad/s, T = 2.19 fs

### Paschen Series (IR)
- **3s → 4p:** ω = 1.06×10¹⁵ rad/s, T = 5.92 fs
- **3p → 4d:** ω = 1.06×10¹⁵ rad/s, T = 5.92 fs

✅ **Verify:** Higher energy transitions → higher frequency → faster oscillations

## Performance Tests

1. **Frame Rate**
   - Open browser performance monitor (F12 → Performance)
   - Play transition
   - ✅ Should maintain 60 FPS

2. **Memory Usage**
   - Check browser task manager
   - ✅ Memory should not increase significantly
   - ✅ No memory leaks after multiple transitions

3. **Shader Overhead**
   - Compare FPS with "QED Oscillations" ON vs OFF
   - ✅ Difference should be < 5 FPS (negligible)

## Console Checks

Open browser console (F12) and verify:

1. **No errors** on page load
2. **No errors** when selecting transition
3. **No errors** during playback
4. **No errors** when toggling controls

Expected console output (none):
```
(no errors or warnings)
```

## Edge Cases

### Test 1: Rapidly Toggle QED Mode
- Play transition
- Rapidly toggle "QED Oscillations" on/off
- ✅ Should handle smoothly without crashes

### Test 2: Change Speed During Playback
- Play transition
- Move speed slider while playing
- ✅ Oscillation frequency should update immediately

### Test 3: Cancel During Build
- Select new transition (triggers rebuild)
- Immediately select different transition
- ✅ Should cancel previous build and start new one
- ✅ No orphaned frames or memory leaks

### Test 4: Multiple Transitions
- Play Lyman α
- Switch to Balmer α
- Switch to Paschen α
- ✅ Each should have correct frequency
- ✅ Old materials should be cleaned up

## Known Issues / Limitations

1. **Dipole direction:** Currently hardcoded for common transitions (s↔p, p↔d)
   - More complex transitions may show incorrect dipole orientation

2. **EM field requires setup:**
   - Must have vector field enabled in visualization section
   - Field source should be set to appropriate mode

3. **Oscillation visibility:**
   - Very fast oscillations (Lyman series) may appear as blur
   - Adjust speed slider to slow down for clarity

## Success Criteria

✅ All syntax checks pass
✅ Application loads without errors
✅ Transitions animate smoothly
✅ QED oscillations visible at t≈0.5
✅ Oscillation frequency correct (matches Bohr frequency)
✅ Dipole arrow oscillates correctly
✅ EM field oscillates in sync (when enabled)
✅ Performance remains at 60 FPS
✅ Controls responsive and functional

## Troubleshooting

### Issue: No oscillations visible
- ✅ Check "QED Oscillations" is enabled
- ✅ Move speed slider to 5× for more visible oscillations
- ✅ Verify transition is at t≈0.5 (maximum interference)

### Issue: Dipole arrow not showing
- ✅ Check "Show Dipole Moment" is enabled
- ✅ Verify transition is playing (not paused)
- ✅ Check browser console for errors

### Issue: EM field not showing
- ✅ Enable "Vector Field" in Visualization section first
- ✅ Then check "Show EM Field" in transition controls
- ✅ Verify field source is set appropriately

### Issue: Performance issues
- ✅ Reduce number of layers (Visualization → Layers → 3 or 5)
- ✅ Disable EM field if enabled
- ✅ Close other browser tabs
- ✅ Try different browser (Chrome recommended)

## Report Issues

If you encounter bugs or unexpected behavior:

1. Check browser console for error messages
2. Note which transition you selected
3. Note which controls were enabled
4. Try to reproduce the issue
5. Document steps to reproduce

---

**Ready to test!** 🚀

Start with the Quick Start Test, then move through Feature Tests. The implementation should demonstrate clear quantum oscillations at the Bohr frequency, synchronized with the electromagnetic field.
