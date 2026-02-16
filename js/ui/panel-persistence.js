// Manages collapsed/expanded state of control panel with localStorage persistence.

export function initPanelPersistence() {
  const topBar = document.getElementById('top-bar');
  const closeBtn = document.getElementById('panel-close');
  const openBtn = document.getElementById('panel-open');

  closeBtn.addEventListener('click', () => {
    topBar.classList.add('collapsed');
    localStorage.setItem('panelCollapsed', 'true');
  });

  openBtn.addEventListener('click', () => {
    topBar.classList.remove('collapsed');
    localStorage.setItem('panelCollapsed', 'false');
  });

  // Restore state on load
  if (localStorage.getItem('panelCollapsed') === 'true') {
    topBar.classList.add('collapsed');
  }
}
