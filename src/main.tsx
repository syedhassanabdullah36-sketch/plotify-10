import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ProductionErrorBoundary } from './components/ProductionErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ProductionErrorBoundary>
    <App />
  </ProductionErrorBoundary>
);
