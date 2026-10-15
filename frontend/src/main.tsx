import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './App';
import './tokens.css';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
