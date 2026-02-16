// Reusable slider helper utilities for consistent input/change event handling.

/**
 * Create a slider with synchronized display and optional change callback.
 * @param {HTMLInputElement} slider - The slider input element
 * @param {HTMLElement} display - The display element for the value
 * @param {Object} config - Configuration object
 * @param {Function} config.parse - Parse slider value (default: Number)
 * @param {Function} config.format - Format display text (default: String)
 * @param {Function} config.onChange - Called on change event (optional)
 * @param {number} config.debounce - Debounce delay in ms (default: 0)
 */
export function createSliderWithDisplay(slider, display, config) {
  const {
    parse = (v) => Number(v),
    format = (v) => String(v),
    onChange = null,
    debounce = 0,
  } = config;

  let timeout = null;

  // Update display on input (immediate visual feedback)
  slider.addEventListener('input', () => {
    const value = parse(slider.value);
    display.textContent = format(value);
  });

  // Trigger action on change (after user releases slider)
  if (onChange) {
    slider.addEventListener('change', () => {
      if (timeout) clearTimeout(timeout);
      if (debounce > 0) {
        timeout = setTimeout(() => onChange(), debounce);
      } else {
        onChange();
      }
    });
  }
}
