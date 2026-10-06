import './styles.css';
import { startApp } from './app.js';
import { renderFooter } from './components/footer.js';
import { applyTheme } from './theme.js';

applyTheme(); // brand colours first, so the first paint is already themed

renderFooter(document.querySelector('#site-footer'));
startApp({
  header: document.querySelector('#site-header'),
  main: document.querySelector('#app'),
});
