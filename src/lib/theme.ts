export const THEME_KEY = 'nonchalant-theme';
// Runs before first paint. Only validated values are applied to the document.
export const themeInitScript = `(function(){var t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';try{var s=localStorage.getItem('${THEME_KEY}');if(s==='light'||s==='dark')t=s;}catch(e){}document.documentElement.dataset.theme=t;})();`;
