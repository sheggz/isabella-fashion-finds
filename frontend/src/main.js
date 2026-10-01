import './styles.css';
import { startApp } from './app.js';

startApp({
  header: document.querySelector('#site-header'),
  main: document.querySelector('#app'),
});
