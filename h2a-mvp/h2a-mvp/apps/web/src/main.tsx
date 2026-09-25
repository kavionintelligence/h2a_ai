import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ByoSyncApp } from './ByoSyncApp';
import './byosync.css';
import './enterprise-workspace.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ByoSyncApp />
  </StrictMode>
);
