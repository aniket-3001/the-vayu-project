// Runs before anything is drawn. src/theme/theme.ts takes over once the app has loaded.
(function () {
  try {
    var pick = localStorage.getItem('vayu.theme.v1');
    var dark = pick === 'dark' || (pick !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    // Storage or matchMedia refused: the page stays light.
  }
})();
