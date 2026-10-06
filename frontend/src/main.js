import './styles.css';
import { startApp } from './app.js';
import { applyTheme } from './theme.js';

applyTheme(); // brand colours first, so the first paint is already themed

startApp({
  header: document.querySelector('#site-header'),
  main: document.querySelector('#app'),
});
