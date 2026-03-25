import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './Components/Context/Auth.jsx'
import { ItemsContextProvider } from './Components/Context/Item.jsx'
import { BrowserRouter } from 'react-router-dom'
import { AIModeProvider } from './Components/Context/AIMode.jsx'


createRoot(document.getElementById('root')).render(
<BrowserRouter>
  <ItemsContextProvider>
  <AIModeProvider>
  <AuthProvider>
  <StrictMode>
    <App />
  </StrictMode>
  </AuthProvider>
  </AIModeProvider>
  </ItemsContextProvider>
</BrowserRouter>
)
