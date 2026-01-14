import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@radix-ui/themes/styles.css';
import { Theme } from '@radix-ui/themes';
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme accentColor="blue" grayColor="slate" radius="medium">
      <App />
    </Theme>
  </StrictMode>,
)
